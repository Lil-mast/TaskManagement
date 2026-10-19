//! Review routes — weekly analytics + stored review. Mounted at `/api/review`.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::json;

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::services::review as svc;
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/weekly", get(get_weekly))
        .route("/weekly/run", post(run_weekly))
}

fn require_db(state: &AppState) -> AppResult<&sqlx::PgPool> {
    state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("review requires a database (set GROWTH_DATABASE_URL)".into())
    })
}

#[derive(Debug, Deserialize)]
struct WeekQuery {
    /// `YYYY-MM-DD` — any day inside the week; defaults to this week
    week: Option<NaiveDate>,
}

/// `GET /api/review/weekly?week=YYYY-MM-DD` — live analytics (SQL, no LLM)
/// plus the stored review row when one exists.
async fn get_weekly(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<WeekQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = require_db(&state)?;
    let week_start = svc::week_start_of(q.week.unwrap_or_else(|| chrono::Utc::now().date_naive()));

    let analytics = svc::analytics(pool, &auth.0, week_start).await?;
    let stored: Option<svc::StoredReview> = sqlx::query_as(
        "SELECT user_id, week_start, payload, model
         FROM weekly_reviews WHERE user_id = $1 AND week_start = $2",
    )
    .bind(&auth.0)
    .bind(&week_start)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Database(format!("stored review read: {e}")))?;

    Ok(Json(json!({
        "analytics": serde_json::to_value(&analytics).unwrap_or_default(),
        "stored": stored,
    })))
}

/// `POST /api/review/weekly/run` — compute + persist this week's review
/// (Claude verdict when Anthropic is configured, headless otherwise).
/// Upsert on (user_id, week_start) — re-running never double-counts.
async fn run_weekly(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<svc::StoredReview>> {
    let pool = require_db(&state)?;
    let stored =
        svc::run_weekly(pool, &auth.0, state.anthropic.as_ref(), svc::week_start_of(
            chrono::Utc::now().date_naive(),
        ))
        .await?;
    Ok(Json(stored))
}
