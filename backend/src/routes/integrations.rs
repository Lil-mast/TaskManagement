//! Integration routes — connect/status/disconnect Google (Phase 3).
//!
//! The callback verifies the signed state (it IS the identity — a browser
//! redirect carries no bearer token) and answers with a tiny browser-friendly
//! HTML page.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(status))
        .route("/dailydev/feeds", get(dailydev_feeds).post(dailydev_refresh))
        .route("/google/url", get(consent_url))
        .route("/google/callback", get(callback))
        .route("/google", delete(disconnect))
        .route("/gmail/url", get(gmail_consent_url))
        .route("/gmail", delete(gmail_disconnect))
}

/// `GET /api/integrations` — probe stored integration state (no network).
async fn status(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let Some(pool) = &state.db else {
        return Err(AppError::Unavailable(
            "integrations require a database (set GROWTH_DATABASE_URL)".into(),
        ));
    };

    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct ProviderRow {
        provider: String,
        scopes: String,
        connected_at: chrono::DateTime<chrono::Utc>,
    }

    let rows: Vec<ProviderRow> = sqlx::query_as(
        "SELECT provider, scopes::text, connected_at FROM integrations
         WHERE user_id = $1 ORDER BY provider",
    )
    .bind(&auth.id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("integration probe: {e}")))?;

    let cached: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM calendar_events WHERE user_id = $1",
    )
    .bind(&auth.id)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("calendar count: {e}")))?;

    let mut providers = serde_json::Map::new();
    for row in rows {
        providers.insert(
            row.provider.clone(),
            json!({
                "connected": true,
                "connected_at": row.connected_at.to_rfc3339(),
                "scopes": row.scopes
                    .trim_matches(|c| c == '{' || c == '}')
                    .split(',')
                    .map(|x| x.trim().to_string())
                    .filter(|x| !x.is_empty())
                    .collect::<Vec<_>>(),
            }),
        );
    }

    Ok(Json(json!({
        "providers": providers,
        "calendar_events_cached": cached,
        "clients_configured": {
            "google": state.calendar.as_ref().map(|c| c.is_configured()).unwrap_or(false),
            "gmail": state.email.as_ref().map(|e| e.is_configured()).unwrap_or(false),
            "dailydev": state
                .dailydev
                .as_ref()
                .map(|d| d.is_configured())
                .unwrap_or(false),
        }
    })))
}

// ---------------------------------------------------------------------------
// daily.dev feeds — GET = cached read (24h TTL), POST = force refresh
// ---------------------------------------------------------------------------

fn dailydev_client(
    state: &AppState,
) -> AppResult<&crate::services::dailydev::DailyDevClient> {
    let client = state.dailydev.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "daily.dev connector not configured (set GROWTH_DAILY_DEV_TOKEN)".into(),
        )
    })?;
    if !client.is_configured() {
        return Err(AppError::Unavailable(
            "daily.dev token not configured (set GROWTH_DAILY_DEV_TOKEN)".into(),
        ));
    }
    Ok(client)
}

fn require_pool(state: &AppState) -> AppResult<&sqlx::PgPool> {
    state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("daily.dev feeds require a database (GROWTH_DATABASE_URL)".into())
    })
}

/// `GET /api/integrations/dailydev/feeds` — cached read; refreshes any feed
/// older than the 24h TTL, degrades to stale cache if the API is down.
async fn dailydev_feeds(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<crate::services::dailydev::DailyDevFeeds>> {
    let pool = require_pool(&state)?;
    let client = dailydev_client(&state)?;
    let feeds = client.get_feeds_with_cache(pool, &auth.id, false).await?;
    Ok(Json(feeds))
}

/// `POST /api/integrations/dailydev/feeds` — force refresh both feeds now.
async fn dailydev_refresh(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<crate::services::dailydev::DailyDevFeeds>> {
    let pool = require_pool(&state)?;
    let client = dailydev_client(&state)?;
    let feeds = client.get_feeds_with_cache(pool, &auth.id, true).await?;
    Ok(Json(feeds))
}

/// `GET /api/integrations/google/url` — consent URL for this user.
async fn consent_url(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let svc = state.calendar.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "google integration not configured (set GROWTH_GOOGLE_CLIENT_ID/SECRET + GROWTH_TOKEN_ENC_KEY)"
                .into(),
        )
    })?;
    Ok(Json(json!({ "url": svc.consent_url(&auth.id) })))
}

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// `GET /api/integrations/google/callback` — browser redirect landing.
/// Identity and provider come from the signed state; dispatch per provider.
async fn callback(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CallbackQuery>,
) -> AppResult<axum::response::Html<String>> {
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("integrations require a database (set GROWTH_DATABASE_URL)".into())
    })?;

    if let Some(err) = &q.error {
        tracing::warn!(error = err, "user denied google consent");
    }
    let code = q.code.as_deref().ok_or_else(|| AppError::BadRequest("missing code".into()))?;

    // any configured service can verify the state — same signing key
    let verified = state
        .calendar
        .as_ref()
        .map(|c| c.verify_state(q.state.as_deref().unwrap_or("")))
        .or_else(|| {
            state
                .email
                .as_ref()
                .map(|e| e.verify_state(q.state.as_deref().unwrap_or("")))
        })
        .flatten()
        .ok_or_else(|| {
            AppError::Unauthorized("state invalid or expired — retry connect".into())
        })?;
    let (provider, user_id) = verified;

    match provider.as_str() {
        "google" => {
            let svc = state.calendar.as_ref().ok_or_else(|| {
                AppError::Unavailable("calendar integration not configured".into())
            })?;
            svc.exchange_code(code, &user_id, pool).await?;
        }
        "gmail" => {
            let svc = state.email.as_ref().ok_or_else(|| {
                AppError::Unavailable("gmail integration not configured".into())
            })?;
            svc.exchange_code(code, &user_id, pool).await?;
        }
        other => {
            return Err(AppError::BadRequest(format!(
                "state names unknown provider {other:?}"
            )))
        }
    }
    tracing::info!(provider = %provider, user = ?user_id, "google integration connected");

    Ok(axum::response::Html(
        "<html><body style='font-family:sans-serif;padding:2rem'>\
<h2>✅ Integration connected</h2>\
<p>You can close this tab.</p></body></html>".into(),
    ))
}

/// `DELETE /api/integrations/google` — revoke + wipe token and mirror.
async fn disconnect(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let svc = state.calendar.as_ref().ok_or_else(|| {
        AppError::Unavailable("google integration not configured".into())
    })?;
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("integrations require a database (set GROWTH_DATABASE_URL)".into())
    })?;
    let deleted = svc.disconnect(pool, &auth.id).await?;
    Ok(Json(json!({ "disconnected": deleted })))
}

/// `GET /api/integrations/gmail/url` — gmail consent URL for this user.
async fn gmail_consent_url(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let svc = state.email.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "gmail not configured (set GROWTH_GOOGLE_CLIENT_ID/SECRET + GROWTH_TOKEN_ENC_KEY)"
                .into(),
        )
    })?;
    Ok(Json(json!({ "url": svc.consent_url(&auth.id) })))
}

/// `DELETE /api/integrations/gmail` — revoke + drop the token row
/// (triage decisions stay — they are the user's, not Google data).
async fn gmail_disconnect(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let svc = state.email.as_ref().ok_or_else(|| {
        AppError::Unavailable("gmail integration not configured".into())
    })?;
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("integrations require a database (set GROWTH_DATABASE_URL)".into())
    })?;
    let deleted = svc.disconnect(pool, &auth.id).await?;
    Ok(Json(json!({ "disconnected": deleted })))
}
