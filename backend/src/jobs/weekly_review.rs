//! Scheduled weekly review — invoked externally (Saturday morning):
//!   0 7 * * 6  curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" http://127.0.0.1:8000/cron/weekly
//!
//! Idempotent: analytics are recomputed from source tables every run and the
//! stored row is an upsert on (user_id, week_start) — a double-fire refreshes
//! the same row, never double-counts (PHASE_5 acceptance).

use std::sync::Arc;

use axum::{extract::State, routing::post, Json, Router};
use serde::Serialize;

use crate::core::error::{AppError, AppResult};
use crate::services::review;
use crate::AppState;
use crate::jobs::morning_brief::CronSecret;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/cron/weekly", post(run_weekly_cron))
        .route("/cron/reweight", post(run_reweight_cron))
}

#[derive(Debug, Serialize)]
struct CronResult {
    user_id: String,
    ok: bool,
    detail: String,
}

/// Review every user that has any trace of activity (tasks, reviews, triage,
/// patterns). Runs headless when Anthropic is absent, verdict and all.
async fn run_weekly_cron(
    State(state): State<Arc<AppState>>,
    _guard: CronSecret,
) -> AppResult<Json<Vec<CronResult>>> {
    let pool = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Unavailable("weekly review requires a database".into()))?;

    let user_ids: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT user_id FROM (
            SELECT user_id FROM tasks
            UNION
            SELECT user_id FROM knowledge_items
            UNION
            SELECT user_id FROM leetcode_attempts
            UNION
            SELECT user_id FROM email_triage
            LIMIT 500
         ) active",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("cron user scan: {e}")))?;

    let week_start = review::week_start_of(chrono::Utc::now().date_naive());
    let mut results = Vec::with_capacity(user_ids.len());
    for uid in user_ids {
        let outcome = match review::run_weekly(pool, &uid, state.anthropic.as_ref(), week_start)
            .await
        {
            Ok(r) => {
                let completed = r
                    .payload
                    .pointer("/analytics/tasks/completed")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                CronResult {
                    user_id: uid,
                    ok: true,
                    detail: format!("week {week_start} stored — {completed} completed"),
                }
            }
            Err(e) => CronResult { user_id: uid, ok: false, detail: e.to_string() },
        };
        tracing::info!(user = %outcome.user_id, ok = outcome.ok, "{}", outcome.detail);
        results.push(outcome);
    }
    Ok(Json(results))
}

/// RAG §7 re-weighting: scheduled right after the weekly review lands, so the
/// new cycle's prompts rank principles by last week's feedback.
async fn run_reweight_cron(
    State(state): State<Arc<AppState>>,
    _guard: CronSecret,
) -> AppResult<Json<serde_json::Value>> {
    let pool = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Unavailable("reweighting requires a database".into()))?;
    let rag = state.rag.as_ref().ok_or_else(|| {
        AppError::Unavailable("reweighting needs GROWTH_EMBEDDINGS_API_KEY (RAG configured)".into())
    })?;
    let touched = rag.reweight(pool).await?;
    Ok(Json(serde_json::json!({ "reweighted_rows": touched })))
}
