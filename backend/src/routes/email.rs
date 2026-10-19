//! Email triage routes — run triage, list inbox decisions, act on them.
//! Mounted at `/api/email`.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::services::email::TriageRow;
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/triage", post(run_triage).get(list_triage))
        .route("/triage/{msg_id}/act", post(act))
}

fn require_email(state: &AppState) -> AppResult<(&crate::services::email::EmailService, &sqlx::PgPool)> {
    let svc = state.email.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "gmail not configured (set GROWTH_GOOGLE_CLIENT_ID/SECRET + GROWTH_TOKEN_ENC_KEY, then consent)"
                .into(),
        )
    })?;
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("email triage requires a database (set GROWTH_DATABASE_URL)".into())
    })?;
    Ok((svc, pool))
}

#[derive(Debug, Serialize)]
struct TriageRun {
    pub stored: usize,
    pub open: Vec<TriageRow>,
}

/// `POST /api/email/triage` — fetch unread → classify → persist (idempotent).
async fn run_triage(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<TriageRun>> {
    let (svc, pool) = require_email(&state)?;
    let anthropic = state.anthropic.as_ref().ok_or_else(|| {
        AppError::Unavailable("email triage needs an Anthropic key".into())
    })?;

    // R4: personal triage rules from the knowledge base (best-effort)
    let rules = retrieve_triage_rules(&state, &auth.0).await;

    let open = svc.triage(pool, &auth.0, anthropic, &rules).await?;
    let stored = open.len();
    Ok(Json(TriageRun { stored, open }))
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    state: Option<String>,
}

/// `GET /api/email/triage?state=open|done|task_created`
async fn list_triage(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<TriageRow>>> {
    let (_svc, pool) = require_email(&state)?;
    let state_filter = match q.state.as_deref().unwrap_or("open") {
        "open" | "done" | "task_created" | "all" => q.state.clone(),
        other => {
            return Err(AppError::BadRequest(format!(
                "unknown state {other:?} — open|done|task_created|all"
            )))
        }
    };

    if state_filter.as_deref() == Some("all") {
        // no filtering
        let rows: Vec<TriageRow> = sqlx::query_as(
            "SELECT gmail_msg_id, user_id, category, summary, subject, state,
                    suggested_task_id, triaged_at
             FROM email_triage WHERE user_id = $1
             ORDER BY triaged_at DESC LIMIT 100",
        )
        .bind(&auth.0)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("triage list: {e}")))?;
        return Ok(Json(rows));
    }

    let state_val = state_filter.unwrap_or_else(|| "open".into());
    Ok(Json(crate::services::email::EmailService::list(pool, &auth.0, &state_val).await?))
}

#[derive(Debug, Deserialize)]
struct ActBody {
    action: String, // "done" | "task"
    #[serde(default)]
    task_title: Option<String>,
}

/// `POST /api/email/triage/{msg_id}/act` — human decision (never auto).
async fn act(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(msg_id): Path<String>,
    Json(body): Json<ActBody>,
) -> AppResult<Json<serde_json::Value>> {
    let (svc, pool) = require_email(&state)?;
    let result = svc.act(pool, &auth.0, &msg_id, &body.action, body.task_title).await?;
    Ok(Json(json!({ "acted": result })))
}

/// R4 retrieval for personal triage rules — degrades to defaults silently.
async fn retrieve_triage_rules(state: &AppState, user_id: &str) -> Vec<String> {
    let (Some(pool), Some(rag)) = (&state.db, &state.rag) else {
        return Vec::new();
    };
    if !rag.is_ready() {
        return Vec::new();
    }
    match rag.retrieve(pool, user_id, "email inbox triage rules reply as task ignore", 3, "email").await {
        Ok(hits) => hits.into_iter().map(|h| h.content).collect(),
        Err(e) => {
            tracing::warn!(error = %e, "triage rule retrieval failed — using defaults");
            Vec::new()
        }
    }
}
