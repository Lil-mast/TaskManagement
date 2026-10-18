//! LeetCode routes (patterns library + attempts + stats).

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::core::{auth::AuthUser, error::{AppError, AppResult}};
use crate::services::leetcode as svc;
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/patterns", get(get_patterns).post(upsert_pattern_r))
        .route("/patterns/{id}/delete", post(delete_pattern_r))
        .route("/attempts", get(get_attempts).post(log_attempt_r))
        .route("/stats", get(get_stats))
}

async fn get_patterns(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<Vec<svc::LeetCodePattern>>> {
    let pool = require_db(&state)?;
    Ok(Json(svc::list_patterns(pool, &auth.0).await?))
}

async fn upsert_pattern_r(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<svc::PatternUpsertBody>,
) -> AppResult<Json<svc::LeetCodePattern>> {
    let pool = require_db(&state)?;
    Ok(Json(svc::upsert_pattern(pool, &auth.0, body).await?))
}

#[derive(Debug, Deserialize)]
struct PatternPath {
    id: uuid::Uuid,
}

async fn delete_pattern_r(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(p): Path<PatternPath>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = require_db(&state)?;
    let deleted = svc::delete_pattern(pool, &auth.0, p.id).await?;
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

#[derive(Debug, Deserialize)]
struct AttemptsQuery {
    limit: Option<i32>,
}

async fn get_attempts(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<AttemptsQuery>,
) -> AppResult<Json<Vec<svc::LeetCodeAttempt>>> {
    let pool = require_db(&state)?;
    Ok(Json(svc::recent_attempts(pool, &auth.0, q.limit.unwrap_or(30)).await?))
}

async fn log_attempt_r(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<svc::LogAttemptBody>,
) -> AppResult<Json<svc::AttemptResult>> {
    let pool = require_db(&state)?;
    Ok(Json(svc::log_attempt(pool, &auth.0, body).await?))
}

#[derive(Debug, Serialize)]
struct PatternStat {
    pattern: String,
    attempts: i64,
    no_help_rate: f64,
    avg_time_min: f64,
}

async fn get_stats(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<Vec<PatternStat>>> {
    let pool = require_db(&state)?;
    let rows: Vec<(String, i64, i64, Option<f64>)> = sqlx::query_as(
        "SELECT p.name,
                COUNT(a.id)::bigint AS attempts,
                COUNT(*) FILTER (WHERE a.needed_help = false)::bigint AS no_help,
                AVG(a.time_taken_min)::float8 AS avg_time
         FROM leetcode_attempts a
         JOIN leetcode_patterns p ON p.id = a.pattern_id
         WHERE a.user_id = $1
         GROUP BY p.name
         ORDER BY attempts DESC",
    )
    .bind(&auth.0)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("stats: {e}")))?;

    let out = rows
        .into_iter()
        .map(|(pattern, attempts, no_help, avg_time)| PatternStat {
            no_help_rate: no_help as f64 / attempts.max(1) as f64,
            avg_time_min: avg_time.unwrap_or(0.0),
            attempts,
            pattern,
        })
        .collect();
    Ok(Json(out))
}

/// Shared DB handle or a 503. Returns a borrow — no clones per request.
fn require_db(state: &AppState) -> AppResult<&sqlx::PgPool> {
    state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("database not configured (set GROWTH_DATABASE_URL)".into())
    })
}
