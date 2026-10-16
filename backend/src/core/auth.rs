use std::{collections::HashMap, sync::Arc, time::{Duration, Instant}};

use axum::{extract::FromRequestParts, http::request::Parts};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use tokio::sync::RwLock;

use super::error::{AppError, AppResult};

/// Firebase securetoken JWKS endpoint (project-independent).
const JWKS_URL: &str =
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const ISSUER_PREFIX: &str = "https://securetoken.google.com/";
const JWKS_REFRESH_TTL: Duration = Duration::from_secs(1800);

/// Verified user identity for any `/api` route — extract it and you're done:
/// `async fn handler(auth: AuthUser, ...)`.
#[derive(Debug, Clone)]
pub struct AuthUser(pub String);

/// Subset of the Firebase ID token payload we act on.
#[derive(Debug, Deserialize)]
struct FirebaseClaims {
    sub: String,
    aud: serde_json::Value,
    #[allow(dead_code)]
    iss: String,
}

/// Process-wide JWKS cache — refreshed on a TTL, shared by all requests.
struct JwksCache {
    keys: RwLock<Arc<HashMap<String, DecodingKey>>>,
    refreshed_at: RwLock<Option<Instant>>,
}

impl JwksCache {
    fn new() -> Self {
        Self {
            keys: RwLock::new(Arc::new(HashMap::new())),
            refreshed_at: RwLock::new(None),
        }
    }

    async fn keys(&self) -> AppResult<Arc<HashMap<String, DecodingKey>>> {
        let needs_refresh = self
            .refreshed_at
            .read()
            .await
            .map(|t| t.elapsed() > JWKS_REFRESH_TTL)
            .unwrap_or(true);
        if needs_refresh {
            self.refresh().await?;
        }
        Ok(self.keys.read().await.clone())
    }

    async fn refresh(&self) -> AppResult<()> {
        let resp = reqwest::Client::new()
            .get(JWKS_URL)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("jwks fetch failed: {e}")))?;
        let jwks: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("jwks parse failed: {e}")))?;

        let mut map: HashMap<String, DecodingKey> = HashMap::new();
        if let Some(items) = jwks.get("keys").and_then(|k| k.as_array()) {
            for item in items {
                let jwk: jsonwebtoken::jwk::Jwk = serde_json::from_value(item.clone())
                    .map_err(|e| AppError::Upstream(format!("jwk corrupt: {e}")))?;
                if let (Ok(key), Some(kid)) = (DecodingKey::from_jwk(&jwk), jwk.common.key_id.clone()) {
                    map.insert(kid, key);
                }
            }
        }
        if map.is_empty() {
            return Err(AppError::Upstream("jwks returned no usable keys".into()));
        }
        *self.keys.write().await = Arc::new(map);
        *self.refreshed_at.write().await = Some(Instant::now());
        tracing::debug!("Firebase JWKS refreshed");
        Ok(())
    }
}

static JWKS_CACHE: std::sync::OnceLock<Arc<JwksCache>> = std::sync::OnceLock::new();

fn shared_cache() -> Arc<JwksCache> {
    JWKS_CACHE.get_or_init(|| Arc::new(JwksCache::new())).clone()
}

/// Decode + validate one Bearer token against the cached JWKS.
async fn verify_firebase_token(token: &str, project_id: &str) -> AppResult<String> {
    let header = jsonwebtoken::decode_header(token)
        .map_err(|e| AppError::Unauthorized(format!("malformed token: {e}")))?;
    let kid = header
        .kid
        .ok_or_else(|| AppError::Unauthorized("token missing kid".into()))?;

    let keys = shared_cache().keys().await?;
    let key = keys.get(&kid).ok_or_else(|| {
        AppError::Unauthorized("unknown kid — token not issued for this Firebase project".into())
    })?;

    let expected_iss = format!("{ISSUER_PREFIX}{project_id}");
    let mut validation = Validation::new(Algorithm::RS256);
    validation.iss = Some(std::collections::HashSet::from([expected_iss]));
    validation.validate_aud = false; // aud checked explicitly against config below

    let data = decode::<FirebaseClaims>(token, key, &validation)
        .map_err(|e| AppError::Unauthorized(format!("invalid token: {e}")))?;

    match &data.claims.aud {
        serde_json::Value::String(aud) if *aud == project_id => {}
        serde_json::Value::Array(list)
            if list.first().and_then(|v| v.as_str()) == Some(project_id) => {}
        _ => {
            return Err(AppError::Unauthorized(
                "aud does not match the configured Firebase project".into(),
            ))
        }
    }
    if data.claims.sub.is_empty() {
        return Err(AppError::Unauthorized("token without subject".into()));
    }
    Ok(data.claims.sub)
}

/// Resolves `AuthUser` from the request:
/// - Firebase verification (`GROWTH_FIREBASE_PROJECT_ID` set), or
/// - a clearly-marked dev fallback (token "dev" → user "local_dev").
impl FromRequestParts<Arc<crate::AppState>> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<crate::AppState>,
    ) -> Result<Self, Self::Rejection> {
        let config = &state.config;

        let bearer = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(str::trim)
            .ok_or_else(|| AppError::Unauthorized("missing bearer token".into()))?;

        if config.firebase_configured() {
            let project_id = config
                .firebase_project_id
                .as_ref()
                .ok_or_else(|| AppError::Config("firebase project id unset".into()))?;
            let uid = verify_firebase_token(bearer, project_id).await?;
            tracing::trace!(user_id = %uid, "authenticated via firebase");
            return Ok(AuthUser(uid));
        }

        if bearer == "dev" {
            tracing::warn!("auth running in DEV mode: token 'dev' accepted as local_dev");
            return Ok(AuthUser("local_dev".to_string()));
        }
        Err(AppError::Unauthorized(
            "dev fallback requires the token literal \"dev\" (no Firebase project configured)"
                .into(),
        ))
    }
}
