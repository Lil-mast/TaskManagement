//! Tasks CRUD — the matrix's data backbone (priority: now/schedule/delegate/drop).
//!
//! Notes:
//! - `user_id` always derives from the verified token (never request bodies).
//! - DELETE is a soft delete (`status = 'archived'`) matching the app's trash
//!   feature; a hard purge exists via `?purge=true`.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    routing::{get, patch},
    Json, Router,
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_tasks).post(create_task))
        .route("/{id}", patch(update_task).delete(delete_task))
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Task {
    pub id: uuid::Uuid,
    pub user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub status: String,
    pub due_date: Option<NaiveDate>,
    pub completed_at: Option<chrono::DateTime<Utc>>,
    pub source: String,
    pub meta: serde_json::Value,
    pub tags: Option<Vec<String>>,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ListTasksQuery {
    /// open | done | archived — default: open
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskBody {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub priority: String,
    #[serde(default)]
    pub due_date: Option<NaiveDate>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskBody {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub status: Option<String>, // open|done|archived — done stamps completed_at
    #[serde(default)]
    pub due_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteTaskQuery {
    pub purge: Option<bool>,
}

const KNOWN_PRIORITIES: [&str; 4] = ["now", "schedule", "delegate", "drop"];
const STATUSES: [&str; 3] = ["open", "done", "archived"];

fn valid_priority(q: &str) -> bool {
    KNOWN_PRIORITIES.contains(&q)
}
fn valid_status(s: &str) -> bool {
    STATUSES.contains(&s)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_tasks(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<ListTasksQuery>,
) -> AppResult<Json<Vec<Task>>> {
    let pool = require_db(&state)?;
    let status: &str = q.status.as_deref().unwrap_or("open");
    if !valid_status(status) {
        return Err(AppError::BadRequest(format!("unknown status {status:?}")));
    }

    let tasks = sqlx::query_as::<_, Task>(
        "SELECT id, user_id, title, description, priority, status, due_date, completed_at,
                source, meta, tags, created_at
         FROM tasks
         WHERE user_id = $1 AND status = $2
         ORDER BY created_at DESC",
    )
    .bind(&auth.0)
    .bind(status)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("list tasks: {e}")))?;

    Ok(Json(tasks))
}

async fn create_task(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<CreateTaskBody>,
) -> AppResult<Json<Task>> {
    let pool = require_db(&state)?;

    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }
    if !valid_priority(&body.priority) {
        return Err(AppError::BadRequest(format!(
            "unknown priority {:?}",
            body.priority
        )));
    }
    let source = body.source.unwrap_or_else(|| "user".to_string());
    if !["user", "ai_briefing", "gmail", "dailydev", "leetcode"].contains(&source.as_str()) {
        return Err(AppError::BadRequest(format!("unknown source {source:?}")));
    }

    let task = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (title, description, priority, user_id, due_date, tags, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, title, description, priority, status, due_date, completed_at,
                   source, meta, tags, created_at",
    )
    .bind(body.title.trim())
    .bind(body.description.as_deref().or(Some("")))
    .bind(&body.priority)
    .bind(&auth.0)
    .bind(body.due_date)
    .bind(body.tags.unwrap_or_default())
    .bind(source)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("create task: {e}")))?;

    Ok(Json(task))
}

async fn update_task(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<UpdateTaskBody>,
) -> AppResult<Json<Task>> {
    let pool = require_db(&state)?;

    if let Some(q) = body.priority.as_deref() {
        if !valid_priority(q) {
            return Err(AppError::BadRequest(format!("unknown priority {q:?}")));
        }
    }
    if let Some(s) = body.status.as_deref() {
        if !valid_status(s) {
            return Err(AppError::BadRequest(format!("unknown status {s:?}")));
        }
    }

    let task = sqlx::query_as::<_, Task>(
        "UPDATE tasks SET
            title        = COALESCE($1, title),
            description  = COALESCE($2, description),
            priority     = COALESCE($3, priority),
            status       = COALESCE($4, status),
            due_date     = COALESCE($5, due_date),
            completed_at = CASE WHEN $4 = 'done'
                                THEN COALESCE(completed_at, NOW())
                                ELSE completed_at END
         WHERE id = $6 AND user_id = $7
         RETURNING id, user_id, title, description, priority, status, due_date, completed_at,
                   source, meta, tags, created_at",
    )
    .bind(body.title.as_deref().map(str::trim).filter(|t| !t.is_empty()))
    .bind(body.description.as_deref().or(None))
    .bind(body.priority.as_deref())
    .bind(body.status.as_deref())
    .bind(body.due_date)
    .bind(id)
    .bind(&auth.0)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Database(format!("update task: {e}")))?
    .ok_or_else(|| AppError::BadRequest("task not found for this user".into()))?;

    Ok(Json(task))
}

async fn delete_task(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(id): Path<uuid::Uuid>,
    Query(q): Query<DeleteTaskQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let pool = require_db(&state)?;

    if q.purge == Some(true) {
        let res = sqlx::query("DELETE FROM tasks WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(&auth.0)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(format!("purge task: {e}")))?;
        return Ok(Json(serde_json::json!({ "purged": res.rows_affected() })));
    }

    // soft delete → archived
    let res = sqlx::query(
        "UPDATE tasks SET status = 'archived' WHERE id = $1 AND user_id = $2 AND status != 'archived'",
    )
    .bind(id)
    .bind(&auth.0)
    .execute(pool)
    .await
    .map_err(|e| AppError::Database(format!("archive task: {e}")))?;
    Ok(Json(serde_json::json!({ "archived": res.rows_affected() })))
}

// ---------------------------------------------------------------------------

pub(crate) fn require_db(state: &AppState) -> AppResult<&sqlx::PgPool> {
    state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Unavailable("database not configured".into()))
}
