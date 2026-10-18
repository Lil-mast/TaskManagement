//! Google identity + calendar plumbing: consent URL, code exchange, silent
//! refresh, and the Calendar v3 event list (next 7 days).
//!
//! `get_valid_token` is THE choke point — every call site refreshes through
//! it, so an expired token never surfaces to a feature (PHASE_3 scope §1).

use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::PgPool;

use super::crypto::TokenCrypto;
use crate::core::error::{AppError, AppResult};

pub const CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";
pub const GMAIL_SCOPE: &str = "https://www.googleapis.com/auth/gmail.readonly";
pub const AUTH_BASE: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

pub const DEFAULT_CALENDAR_BASE_URL: &str = "https://www.googleapis.com/calendar/v3";
pub const DEFAULT_GMAIL_BASE_URL: &str = "https://gmail.googleapis.com/gmail/v1";

#[derive(Debug, Clone)]
pub struct GoogleSettings {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_url: String,
    /// Phase 3: calendar read-only. Phase 4 (Gmail) consents separately into
    /// its own `integrations` provider row.
    pub scope: String,
    /// API roots (overridable so wiremock tests can pin a fake server)
    pub calendar_base_url: String,
    pub gmail_base_url: String,
}

/// How far ahead of `expires_at` a token counts as stale (clock skew + a
/// half-open request budget).
pub const TOKEN_REFRESH_MARGIN_SECS: i64 = 60;

#[derive(Clone)]
pub struct GoogleClient {
    http: reqwest::Client,
    settings: std::sync::Arc<GoogleSettings>,
}

impl GoogleClient {
    pub fn new(settings: GoogleSettings) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest trivially valid");
        Self { http, settings: std::sync::Arc::new(settings) }
    }

    /// Gmail API root (overridable in tests).
    pub fn gmail_base(&self) -> &str {
        &self.settings.gmail_base_url
    }

    pub fn is_configured(&self) -> bool {
        !self.settings.client_id.is_empty()
    }

    /// Consent URL with the signed state bound to (provider, user).
    pub fn consent_url(&self, crypto: &TokenCrypto, provider: &str, user_id: &str) -> String {
        let state = crypto.sign_state(provider, user_id);
        let mut url = url::Url::parse(AUTH_BASE).expect("static auth base is valid");
        url.query_pairs_mut()
            .append_pair("client_id", &self.settings.client_id)
            .append_pair("redirect_uri", &self.settings.redirect_url)
            .append_pair("response_type", "code")
            .append_pair("scope", &self.settings.scope)
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent")
            .append_pair("state", &state);
        url.to_string()
    }

    /// Exchange an authorization code (from the callback) and store the token
    /// tuple encrypted at rest under the consenting provider.
    pub async fn exchange_code(
        &self,
        code: &str,
        crypto: &TokenCrypto,
        provider: &str,
        scopes: Vec<String>,
        state_user_id: &str,
        pool: &PgPool,
    ) -> AppResult<()> {
        let token: TokenResponse = self
            .token_request(&[
                ("code", code),
                ("client_id", self.settings.client_id.as_str()),
                ("client_secret", self.settings.client_secret.as_str()),
                ("redirect_uri", self.settings.redirect_url.as_str()),
                ("grant_type", "authorization_code"),
            ])
            .await?;

        store_token(pool, crypto, state_user_id, provider, Some(scopes), &token).await
    }

    /// Central refresh path — decrypt, refresh when stale, re-encrypt, update.
    /// Returns a live access token or a clear "not connected" error.
    pub async fn get_valid_token(
        &self,
        pool: &PgPool,
        crypto: &TokenCrypto,
        user_id: &str,
        provider: &str,
    ) -> AppResult<String> {
        let row: Option<(Vec<u8>, DateTime<Utc>)> = sqlx::query_as(
            "SELECT access_token_enc, expires_at FROM integrations
             WHERE user_id = $1 AND provider = $2",
        )
        .bind(user_id)
        .bind(provider)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(format!("integration read: {e}")))?;

        let (enc_access, expires_at) = row.ok_or_else(|| {
            AppError::Unavailable(format!("{provider} not connected for this user"))
        })?;

        let now = now_secs();
        if expires_at.timestamp() - now > TOKEN_REFRESH_MARGIN_SECS {
            return crypto.decrypt_for_user(user_id, &enc_access);
        }

        // ---- stale → refresh ----
        let enc_refresh: Vec<u8> = sqlx::query_scalar(
            "SELECT refresh_token_enc FROM integrations
             WHERE user_id = $1 AND provider = $2",
        )
        .bind(user_id)
        .bind(provider)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(format!("refresh token read: {e}")))?;
        let refresh_token = crypto.decrypt_for_user(user_id, &enc_refresh)?;

        let fresh: TokenResponse = self
            .token_request(&[
                ("refresh_token", refresh_token.as_str()),
                ("client_id", self.settings.client_id.as_str()),
                ("client_secret", self.settings.client_secret.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .await?;

        // Google may re-issue a refresh token; keep the old one when absent.
        store_token(pool, crypto, user_id, provider, None, &fresh).await?;
        crypto.decrypt_for_user(
            user_id,
            &sqlx::query_scalar::<_, Vec<u8>>(
                "SELECT access_token_enc FROM integrations
                 WHERE user_id = $1 AND provider = $2",
            )
            .bind(user_id)
            .bind(provider)
            .fetch_one(pool)
            .await
            .map_err(|e| AppError::Database(format!("fresh token read: {e}")))?,
        )
    }

    /// Calendar v3: next-7-day events for the primary calendar. Only the
    /// fields the product needs cross the wire (no attendee emails kept).
    pub async fn list_events(
        &self,
        token: &str,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> AppResult<Vec<GoogleEvent>> {
        let url = url::Url::parse_with_params(
            &format!("{}/primary/events", self.settings.calendar_base_url),
            &[
                ("timeMin", from.to_rfc3339()),
                ("timeMax", to.to_rfc3339()),
                ("singleEvents", "true".into()),
                ("orderBy", "startTime".into()),
                ("maxResults", "250".into()),
            ],
        )
        .map_err(|e| AppError::Internal(anyhow::anyhow!("calendar url: {e}")))?;

        #[derive(Deserialize)]
        struct CalendarResponse {
            #[serde(default)]
            items: Vec<GoogleEvent>,
        }

        let resp: CalendarResponse = self
            .http
            .get(url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("calendar fetch: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Upstream(format!("calendar fetch rejected: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("calendar body invalid: {e}")))?;
        Ok(resp.items)
    }

    /// Best-effort token revocation on disconnect (Google-side).
    pub async fn revoke(&self, token: &str) {
        let _ = self
            .http
            .post("https://oauth2.googleapis.com/revoke")
            .query(&[("token", token)])
            .send()
            .await;
    }

    async fn token_request(&self, form: &[(&str, &str)]) -> AppResult<TokenResponse> {
        self.http
            .post(TOKEN_URL)
            .form(form)
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("google token request: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Upstream(format!("google token request rejected: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("google token body invalid: {e}")))
    }
}

/// Refresh-token blobs; replacements keep the old refresh token when Google
/// does not re-issue one.
#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    access_token: String,
    expires_in: i64,
    #[serde(default)]
    refresh_token: Option<String>,
}

/// One normalized calendar event (all-day events satisfy their date at 00:00
/// with busy=false reflection handled by the caller via transparency).
#[derive(Debug, Clone, Deserialize)]
pub struct GoogleEvent {
    pub id: String,
    #[serde(default)]
    pub summary: Option<String>,
    start: EventTime,
    end: EventTime,
    #[serde(default)]
    pub transparency: Option<String>, // "transparent" = free, not busy
}

#[derive(Debug, Clone, Deserialize)]
struct EventTime {
    #[serde(default)]
    date_time: Option<String>,
    #[serde(default)]
    date: Option<String>,
}impl GoogleEvent {
    pub fn title(&self) -> String {
        self.summary.clone().unwrap_or_else(|| "(untitled event)".into())
    }

    fn start(&self) -> Option<DateTime<Utc>> {
        parse_event_time(&self.start)
    }

    fn end(&self) -> Option<DateTime<Utc>> {
        parse_event_time(&self.end)
    }

    /// Normalized (start, end) instants; `None` when the event carries no
    /// usable time (malformed payload).
    pub fn times(&self) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
        Some((self.start()?, self.end()?))
    }

    pub fn is_busy(&self) -> bool {
        self.transparency.as_deref() != Some("transparent")
    }
}

/// Persist (upsert) the encrypted token tuple for one user+provider.
/// `keep_existing_scopes` merges rather than clobbers scopes on refresh.
async fn store_token(
    pool: &PgPool,
    crypto: &TokenCrypto,
    user_id: &str,
    provider: &str,
    scopes: Option<Vec<String>>,
    token: &TokenResponse,
) -> AppResult<()> {
    let enc_access = crypto.encrypt_for_user(user_id, &token.access_token)?;
    let enc_refresh = match &token.refresh_token {
        Some(rt) => crypto.encrypt_for_user(user_id, rt)?,
        None => {
            // keep the existing refresh token when Google omits it
            sqlx::query_scalar::<_, Option<Vec<u8>>>(
                "SELECT refresh_token_enc FROM integrations
                 WHERE user_id = $1 AND provider = $2",
            )
            .bind(user_id)
            .bind(provider)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Database(format!("refresh read: {e}")))?
            .flatten()
            .ok_or_else(|| {
                AppError::Upstream(format!(
                    "google issued no refresh token when connecting {provider}"
                ))
            })?
        }
    };
    let expires_at = Utc::now() + chrono::Duration::seconds(token.expires_in);

    sqlx::query(
        "INSERT INTO integrations (user_id, provider, access_token_enc, refresh_token_enc,
                                   expires_at, scopes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, provider) DO UPDATE
         SET access_token_enc = EXCLUDED.access_token_enc,
             refresh_token_enc = EXCLUDED.refresh_token_enc,
             expires_at = EXCLUDED.expires_at,
             scopes = COALESCE(EXCLUDED.scopes, integrations.scopes),
             connected_at = NOW()",
    )
    .bind(user_id)
    .bind(provider)
    .bind(&enc_access)
    .bind(&enc_refresh)
    .bind(&expires_at)
    .bind(scopes)
    .execute(pool)
    .await
    .map_err(|e| AppError::Database(format!("token persist: {e}")))?;
    Ok(())
}

/// RFC3339 datetime, or an all-day `date` at midnight UTC.
fn parse_event_time(t: &EventTime) -> Option<DateTime<Utc>> {
    if let Some(dt) = t.date_time.as_deref() {
        if let Ok(d) = DateTime::parse_from_rfc3339(dt) {
            return Some(d.with_timezone(&Utc));
        }
    }
    t.date
        .as_deref()
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .and_then(|nd| nd.and_hms_opt(0, 0, 0))
        .map(|ndt| ndt.and_utc())
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
