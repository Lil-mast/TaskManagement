//! Verified-identity extraction for `/api` routes.
//!
//! Provider precedence on every Bearer token:
//!   1. **Firebase Auth** (`GROWTH_FIREBASE_PROJECT_ID` set) — THE production
//!      identity (user-directed 2026-10-20): the frontend signs in with the
//!      Google OAuth popup through Firebase and gives us its ID token; we verify it
//!      RS256/JWKS against `https://securetoken.google.com/<project>`.
//!   2. **Supabase Auth** (`GROWTH_SUPABASE_URL` set) — optional alternate
//!      source (asymmetric JWKS; legacy HS256 only with the shared secret).
//!      Supabase is the data plane (Postgres + RLS); its Auth is NOT used.
//!   3. **Dev fallback** — literal token `"dev"` → `local_dev`; ONLY accepted
//!      when no identity provider is configured. Never in production.
//!
//! `user_id` on every row is the verified `sub` — request bodies never carry
//! identity. App-level binding (every query binds the verified uid) is the
//! enforcement layer for the backend; RLS (`app.current_user_id` policies) is
//! the parallel constraint when direct PostgREST access is later needed.

use std::{collections::HashMap, sync::Arc, time::Instant};

use axum::{extract::FromRequestParts, http::request::Parts};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use std::time::Duration;
use tokio::sync::RwLock;

use super::error::{AppError, AppResult};

const JWKS_REFRESH_TTL: Duration = Duration::from_secs(1800);
const FIREBASE_JWKS_URL: &str =
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const FIREBASE_ISSUER_PREFIX: &str = "https://securetoken.google.com/";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

/// Verified user identity for any `/api` route — extract it and you're done:
/// `async fn handler(auth: AuthUser, ...)`.
#[derive(Debug, Clone)]
pub struct AuthUser(pub String);

/// Minimal usable token payload for either provider.
#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    #[allow(dead_code)]
    aud: serde_json::Value,
    #[allow(dead_code)]
    iss: String,
}

// ---------------------------------------------------------------------------
// Per-source JWKS caches (Firebase and each Supabase project have their own)
// ---------------------------------------------------------------------------

/// One JWKS source — refreshed on a TTL, shared across all requests, so
/// verification costs no per-request network hop.
struct JwksCache {
    url: String,
    keys: RwLock<Arc<HashMap<String, DecodingKey>>>,
    refreshed_at: RwLock<Option<Instant>>,
}

impl JwksCache {
    fn new(url: &str) -> Self {
        Self {
            url: url.to_string(),
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
            .get(&self.url)
            .timeout(HTTP_TIMEOUT)
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
        tracing::debug!(url = %self.url, "JWKS refreshed");
        Ok(())
    }
}

static CACHES: std::sync::OnceLock<tokio::sync::Mutex<HashMap<String, Arc<JwksCache>>>> =
    std::sync::OnceLock::new();

async fn cache_for(jwks_url: &str) -> AppResult<Arc<JwksCache>> {
    let map = CACHES.get_or_init(tokio::sync::Mutex::default);
    let mut guards = map.lock().await;
    let entry = guards
        .entry(jwks_url.to_string())
        .or_insert_with(|| Arc::new(JwksCache::new(jwks_url)));
    Ok(entry.clone())
}

/// Decode + validate one token against a cached JWKS source.
async fn verify_with_jwks(token: &str, jwks_url: &str, expected_iss: &str) -> AppResult<String> {
    let header = jsonwebtoken::decode_header(token)
        .map_err(|e| AppError::Unauthorized(format!("malformed token: {e}")))?;
    let kid = header
        .kid
        .ok_or_else(|| AppError::Unauthorized("token missing kid".into()))?;

    let keys = cache_for(jwks_url).await?.keys().await?;
    let key = keys.get(&kid).ok_or_else(|| {
        AppError::Unauthorized("unknown token signing key for this identity source".into())
    })?;

    let mut validation = Validation::new(header.alg);
    validation.iss = Some(std::collections::HashSet::from([expected_iss.into()]));
    validation.validate_aud = false; // tenancy bound via the project-specific issuer instead
    validation.leeway = 60; // device clock drift

    let data = decode::<Claims>(token, key, &validation)
        .map_err(|e| AppError::Unauthorized(format!("invalid token: {e}")))?;
    if data.claims.sub.is_empty() {
        return Err(AppError::Unauthorized("token without subject".into()));
    }
    Ok(data.claims.sub)
}

async fn verify_firebase_token(token: &str, project_id: &str) -> AppResult<String> {
    let iss = format!("{FIREBASE_ISSUER_PREFIX}{project_id}");
    verify_with_jwks(token, FIREBASE_JWKS_URL, &iss).await
}

async fn verify_supabase_token(
    token: &str,
    origin: &str,
    jwt_secret: Option<&str>,
) -> AppResult<String> {
    let iss = format!("{origin}/auth/v1");
    let header = jsonwebtoken::decode_header(token)
        .map_err(|e| AppError::Unauthorized(format!("malformed token: {e}")))?;

    if header.alg == Algorithm::HS256 {
        // Legacy projects: HMAC with the project JWT secret. The secret is
        // project-specific, so possession of *this project's* secret is
        // exactly the trust boundary.
        let secret = jwt_secret
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                AppError::Unauthorized(
                    "legacy HS256 token — set GROWTH_SUPABASE_JWT_SECRET or migrate the \
                     project to asymmetric signing keys"
                        .into(),
                )
            })?;
        let mut validation = Validation::new(Algorithm::HS256);
        validation.iss = Some(std::collections::HashSet::from([iss]));
        validation.validate_aud = false;
        validation.leeway = 60;
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &validation,
        )
        .map_err(|e| AppError::Unauthorized(format!("invalid token: {e}")))?;
        if data.claims.sub.is_empty() {
            return Err(AppError::Unauthorized("token without subject".into()));
        }
        return Ok(data.claims.sub);
    }

    verify_with_jwks(token, &format!("{origin}/auth/v1/.well-known/jwks.json"), &iss).await
}

/// Resolves `AuthUser` from the request (precedence documented at top).
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

        if config.supabase_configured() {
            let origin = config.supabase_origin().unwrap_or_default();
            let uid =
                verify_supabase_token(bearer, origin, config.supabase_jwt_secret.as_deref()).await?;
            tracing::trace!(user_id = %uid, "authenticated via supabase");
            return Ok(AuthUser(uid));
        }

        if bearer == "dev" {
            tracing::warn!("auth running in DEV mode: token 'dev' accepted as local_dev");
            return Ok(AuthUser("local_dev".to_string()));
        }
        Err(AppError::Unauthorized(
            "dev fallback requires the token literal \"dev\" (no identity provider configured)"
                .into(),
        ))
    }
}
