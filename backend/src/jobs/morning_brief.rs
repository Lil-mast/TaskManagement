//! Scheduled morning brief — invoked externally:
//!   0 6 * * *  curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" http://127.0.0.1:8000/cron/briefing
//!
//! Idempotent: compose-or-reuse (Phase 1 briefing service), so a double-fire
//! costs nothing and never duplicates briefs.

use std::sync::Arc;

use axum::{extract::State, routing::post, Json, Router};
use serde::Serialize;

use crate::core::error::{AppError, AppResult};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/cron/briefing", post(run_morning_brief))
}

#[derive(Debug, Serialize)]
struct CronResult {
    user_id: String,
    ok: bool,
    detail: String,
}

/// Compose today's brief for every user with open tasks.
async fn run_morning_brief(
    State(state): State<Arc<AppState>>,
    _guard: CronSecret,
) -> AppResult<Json<Vec<CronResult>>> {
    let service = state.briefing.as_ref().ok_or_else(|| {
        AppError::Unavailable("briefing not configured (missing Anthropic key)".into())
    })?;
    let pool = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Unavailable("briefing requires a database".into()))?;

    let user_ids: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT user_id FROM tasks WHERE status = 'open' LIMIT 100",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("cron user scan: {e}")))?;

    let mut results = Vec::with_capacity(user_ids.len());
    for uid in user_ids {
        let outcome = match service.ensure_today(pool, &uid, false).await {
            Ok(brief) => {
                let payload = brief.payload.clone();
                let prio = payload.get("priorities").and_then(|p| p.as_array()).map(|a| a.len()).unwrap_or(0);
                let watch = payload.get("watchlist").and_then(|p| p.as_array()).map(|a| a.len()).unwrap_or(0);
                CronResult {
                    user_id: uid,
                    ok: true,
                    detail: format!(
                        "brief {} — {prio} priorities, {watch} watch items",
                        brief.brief_date,
                    ),
                }
            }
            Err(e) => CronResult { user_id: uid, ok: false, detail: e.to_string() },
        };
        tracing::info!(user = %outcome.user_id, ok = outcome.ok, "{}", outcome.detail);
        results.push(outcome);
    }
    Ok(Json(results))
}

/// Guard: `x-cron-secret` must match `GROWTH_CRON_SECRET`; the route stays
/// hard-503 when no secret is configured (production MUST set one).
struct CronSecret;

impl axum::extract::FromRequestParts<Arc<AppState>> for CronSecret {
    type Rejection = AppError;
    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let expected = state
            .config
            .cron_secret
            .as_deref()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                AppError::Unavailable("no GROWTH_CRON_SECRET — set it to schedule briefs".into())
            })?;
        let got = parts
            .headers
            .get("x-cron-secret")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("missing x-cron-secret".into()))?;
        if got.len() != expected.len() {
            return Err(AppError::Unauthorized("bad x-cron-secret".into()));
        }
        // lenient compare — cron traffic only, never user auth
        if got != expected {
            return Err(AppError::Unauthorized("bad x-cron-secret".into()));
        }
        Ok(CronSecret)
    }
}
