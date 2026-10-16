use std::sync::Arc;

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::services::capture::ProposedTask;
use crate::AppState;

/// Routes mounted at `/api/capture`.
pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/", post(capture))
}

#[derive(Debug, Deserialize)]
pub struct CaptureRequest {
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub tasks: Vec<ProposedTask>,
    /// present when a configured DATABASE_URL auto-saved the proposal
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_to_db: Option<usize>,
}

/// `POST /api/capture` —
/// `{ "text": "call the dentist tomorrow, finish report before Monday" }` →
/// Claude tool use → `[ProposedTask]` (persistence live when the DB is wired).
pub async fn capture(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<CaptureRequest>,
) -> AppResult<Json<CaptureResponse>> {
    let service = state.capture.as_ref().ok_or_else(|| {
        AppError::Unavailable("capture service not configured (no Anthropic key)".into())
    })?;

    let tasks = service.capture(&req.text).await?;

    // Optional persistence — flips on with DATABASE_URL, stays silent otherwise.
    let saved_to_db = match &state.db {
        Some(pool) => {
            let saved = save_tasks(pool, &auth.0, &tasks).await?;
            tracing::info!(count = saved, "capture persisted to Postgres");
            Some(saved)
        }
        None => None,
    };

    Ok(Json(CaptureResponse { tasks, saved_to_db }))
}

async fn save_tasks(
    pool: &sqlx::PgPool,
    user_id: &str,
    tasks: &[ProposedTask],
) -> AppResult<usize> {
    let mut saved = 0;
    for task in tasks {
        let meta = serde_json::json!({
            "confidence": task.confidence,
            "source": "nl_capture_phase0"
        });
        sqlx::query(
            "INSERT INTO tasks (title, description, quadrant, user_id, source, tags, meta)
             VALUES ($1, $2, $3, $4, 'nl_capture', $5, $6)",
        )
        .bind(&task.title)
        .bind(task.description.as_deref().unwrap_or(""))
        .bind(task.quadrant.as_db_string())
        .bind(user_id)
        .bind(&task.tags)
        .bind(meta)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("insert task failed: {e}")))?;
        saved += 1;
    }
    Ok(saved)
}
