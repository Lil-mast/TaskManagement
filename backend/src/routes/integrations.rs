//! Integration routes — connect/status/disconnect Google (Phase 3).
//!
//! The callback verifies the signed state (it IS the identity — a browser
//! redirect carries no bearer token) and answers with a tiny SPA-friendly
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
        .route("/google/url", get(consent_url))
        .route("/google/callback", get(callback))
        .route("/google", delete(disconnect))
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

    #[derive(Debug, Serialize)]
    struct GoogleStatus {
        connected: bool,
        connected_at: Option<String>,
        scopes: Vec<String>,
        calendar_events_cached: i64,
        client_configured: bool,
    }

    let row: Option<(String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT scopes::text, connected_at FROM integrations
         WHERE user_id = $1 AND provider = 'google'",
    )
    .bind(&auth.0)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Database(format!("integration probe: {e}")))?;

    let cached: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM calendar_events WHERE user_id = $1",
    )
    .bind(&auth.0)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("calendar count: {e}")))?;

    let (connected, connected_at, scopes) = match &row {
        Some((scopes_text, at)) => (
            true,
            Some(at.to_rfc3339()),
            scopes_text
                .trim_matches(|c| c == '{' || c == '}')
                .split(',')
                .map(|x| x.trim().to_string())
                .filter(|x| !x.is_empty())
                .collect::<Vec<_>>(),
        ),
        None => (false, None, Vec::new()),
    };

    Ok(Json(json!({
        "google": GoogleStatus {
            connected,
            connected_at,
            scopes,
            calendar_events_cached: cached,
            client_configured: state.calendar.as_ref().map(|c| c.is_configured()).unwrap_or(false),
        }
    })))
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
    Ok(Json(json!({ "url": svc.consent_url(&auth.0) })))
}

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// `GET /api/integrations/google/callback` — browser redirect landing.
async fn callback(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CallbackQuery>,
) -> AppResult<axum::response::Html<String>> {
    let svc = state.calendar.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "google integration not configured (set GROWTH_GOOGLE_CLIENT_ID/SECRET + GROWTH_TOKEN_ENC_KEY)"
                .into(),
        )
    })?;
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("integrations require a database (set GROWTH_DATABASE_URL)".into())
    })?;

    if let Some(err) = &q.error {
        tracing::warn!(error = err, "user denied google consent");
    }
    let code = q.code.as_deref().ok_or_else(|| AppError::BadRequest("missing code".into()))?;
    let state_param = q
        .state
        .as_deref()
        .and_then(|s| svc.verify_state(s))
        .ok_or_else(|| AppError::Unauthorized("state invalid or expired — retry connect".into()))?;

    svc.exchange_code(code, &state_param, pool).await?;
    tracing::info!(user = ?state_param, "google integration connected");

    Ok(axum::response::Html(
        "<html><body style='font-family:sans-serif;padding:2rem'>\
<h2>✅ Google Calendar connected</h2>\
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
    let deleted = svc.disconnect(pool, &auth.0).await?;
    Ok(Json(json!({ "disconnected": deleted })))
}
