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
    /// Proposals only by default. `true` is the explicit opt-in used by
    /// internal tools — the product path accepts through `POST /api/tasks`.
    #[serde(default)]
    pub persist: bool,
}

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub tasks: Vec<ProposedTask>,
    /// present only when the caller explicitly opted into `persist: true`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_to_db: Option<usize>,
}

/// `POST /api/capture` —
/// `{ "text": "call the dentist tomorrow, finish report before Monday" }` →
/// Claude tool use → `[ProposedTask]` (proposals only; persistence requires
/// the explicit `"persist": true` opt-in).
pub async fn capture(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<CaptureRequest>,
) -> AppResult<Json<CaptureResponse>> {
    let service = state.capture.as_ref().ok_or_else(|| {
        AppError::Unavailable("capture service not configured (no Anthropic key)".into())
    })?;
    state.enforce_llm_quota(&auth).await?;

    let principles = retrieve_principles(&state, &auth.id, &req.text, 2).await;
    let tasks = service.capture(&req.text, &principles).await?;

    // Persistence is explicit opt-in — the product rule is "propose, don't decide".
    let saved_to_db = match (&state.db, req.persist) {
        (Some(pool), true) => {
            let saved = save_tasks(pool, &auth.id, &tasks).await?;
            tracing::info!(
                count = saved,
                "capture persisted to Postgres (explicit opt-in)"
            );
            Some(saved)
        }
        _ => None,
    };

    Ok(Json(CaptureResponse { tasks, saved_to_db }))
}

/// R2: top-k book principles for this capture text. Requires db + rag; on any
/// failure returns `[]` — capture must never break because retrieval did.
async fn retrieve_principles(state: &AppState, user_id: &str, text: &str, k: usize) -> Vec<String> {
    let (Some(pool), Some(rag)) = (&state.db, &state.rag) else {
        return Vec::new();
    };
    if !rag.is_ready() {
        return Vec::new();
    }
    match rag.retrieve(pool, user_id, text, k, "capture").await {
        Ok(hits) => hits.iter().map(|h| h.content.clone()).collect(),
        Err(e) => {
            tracing::warn!(error = %e, "principle retrieval failed — capture proceeds without RAG");
            Vec::new()
        }
    }
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
            "INSERT INTO tasks (title, description, priority, user_id, source, tags, meta)
             VALUES ($1, $2, $3, $4, 'nl_capture', $5, $6)",
        )
        .bind(&task.title)
        .bind(task.description.as_deref().unwrap_or(""))
        .bind(task.priority.as_db_string())
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
