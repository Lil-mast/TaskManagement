//! Knowledge (principles) routes — ingest books JSON, list, feedback.
//!
//! Ingest accepts either an inline `items` array or (when the body is empty)
//! reads `backend/data/books/*.json` — the expected shape per item:
//! `{ "book", "chapter", "idea", "application", "tags", "weight" }`.

use std::sync::Arc;

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::services::rag::{IngestSummary, KnowledgeHit, KnowledgeIngestItem, RagService};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/ingest", post(ingest))
        .route("/items", get(list_items))
        .route("/search", post(search))
        .route("/feedback", post(feedback))
        .route("/weights", get(weights))
}

#[derive(Debug, Deserialize, Default)]
struct IngestBody {
    #[serde(default)]
    items: Vec<KnowledgeIngestItem>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct KnowledgeItemRow {
    id: uuid::Uuid,
    book: String,
    chapter: Option<String>,
    idea: String,
    weight: f64,
    accepted_count: i32,
}

/// `POST /api/knowledge/ingest` — body `{ items: [...] }` or `{}`
/// ({}. falls back to `backend/data/books/*.json` files).
async fn ingest(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    body: Option<Json<IngestBody>>,
) -> AppResult<Json<IngestSummary>> {
    let rag = require_rag(&state)?;
    let pool = require_db(&state)?;

    let mut items = body.map(|Json(b)| b.items).unwrap_or_default();
    if items.is_empty() {
        items = load_books_from_disk(&state)?;
    }

    let summary = rag.ingest(pool, &auth.0, &items).await?;
    tracing::info!(
        user = ?auth.0,
        received = summary.items_received,
        new = summary.items_new,
        embedded = summary.chunks_embedded,
        "knowledge ingest done"
    );
    Ok(Json(summary))
}

async fn list_items(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<Vec<KnowledgeItemRow>>> {
    let pool = require_db(&state)?;
    let rows: Vec<KnowledgeItemRow> = sqlx::query_as(
        "SELECT id, book, chapter, idea,
                COALESCE(weight, 1.0)::float8 AS weight,
                COALESCE(accepted_count, 0)::int AS accepted_count
         FROM knowledge_items
         WHERE user_id = $1
         ORDER BY book, created_at",
    )
    .bind(&auth.0)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("knowledge list: {e}")))?;
    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
struct SearchBody {
    query: String,
    #[serde(default)]
    k: Option<usize>,
}

/// `POST /api/knowledge/search` — direct hybrid retrieval (debug / power use).
async fn search(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<SearchBody>,
) -> AppResult<Json<Vec<KnowledgeHit>>> {
    let rag = require_rag(&state)?;
    let pool = require_db(&state)?;
    let hits = rag
        .retrieve(pool, &auth.0, &body.query, body.k.unwrap_or(6), "search")
        .await?;
    Ok(Json(hits))
}

#[derive(Debug, Deserialize)]
struct FeedbackBody {
    item_id: uuid::Uuid,
}

/// `POST /api/knowledge/feedback` — "this principle earned its keep".
async fn feedback(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<FeedbackBody>,
) -> AppResult<Json<serde_json::Value>> {
    let rag = require_rag(&state)?;
    let pool = require_db(&state)?;
    rag.upvote(pool, &auth.0, body.item_id).await?;
    Ok(Json(json!({ "ok": true, "item_id": body.item_id })))
}

/// `GET /api/knowledge/weights` — live influence of each principle:
/// base weight, effective weight (RAG §7), accepts, conflicts, surfacing in
/// the last 30 days, and the quarantine flag.
async fn weights(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let pool = require_db(&state)?;
    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct WeightRow {
        id: uuid::Uuid,
        book: String,
        idea: String,
        weight: f64,
        effective_weight: f64,
        accepted_count: i64,
        conflicts: i64,
        surfaced_30d: i64,
    }

    let rows: Vec<WeightRow> = sqlx::query_as(
        "SELECT ki.id, ki.book, ki.idea,
                ki.weight::float8 AS weight,
                ki.effective_weight::float8 AS effective_weight,
                COALESCE(ki.accepted_count, 0)::bigint AS accepted_count,
                COALESCE(ki.conflicts, 0)::bigint AS conflicts,
                (SELECT COUNT(*) FROM knowledge_surface_log sl
                 WHERE sl.knowledge_item_id = ki.id
                   AND sl.surfaced_at >= NOW() - INTERVAL '30 days')::bigint
                    AS surfaced_30d
         FROM knowledge_items ki
         WHERE ki.user_id = $1
         ORDER BY ki.effective_weight DESC,
                  COALESCE(ki.accepted_count, 0) DESC, ki.book",
    )
    .bind(&auth.0)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("weights read: {e}")))?;

    let quarantined: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM knowledge_items
         WHERE user_id = $1 AND effective_weight <= 0.15",
    )
    .bind(&auth.0)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("weights count: {e}")))?;

    Ok(Json(json!({
        "items": rows,
        "quarantined": quarantined,
        "note": "quarantine = effective_weight ≤ 0.1 — deprioritized, never deleted"
    })))
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

fn require_rag(state: &AppState) -> AppResult<&RagService> {
    let rag = state
        .rag
        .as_ref()
        .ok_or_else(|| AppError::Unavailable("embeddings not configured (set GROWTH_EMBEDDINGS_API_KEY)".into()))?;
    if !rag.is_ready() {
        return Err(AppError::Unavailable(
            "embeddings API key missing — set GROWTH_EMBEDDINGS_API_KEY".into(),
        ));
    }
    Ok(rag)
}

fn require_db(state: &AppState) -> AppResult<&sqlx::PgPool> {
    state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("database not configured (set GROWTH_DATABASE_URL)".into())
    })
}

/// Read + parse every `*.json` under the books dir (GROWTH_BOOKS_DIR,
/// default `data/books`). Each file is an array of KnowledgeIngestItem.
fn load_books_from_disk(state: &AppState) -> AppResult<Vec<KnowledgeIngestItem>> {
    use std::path::PathBuf;

    let dir = PathBuf::from(
        state
            .config
            .books_dir
            .clone()
            .unwrap_or_else(|| "data/books".into()),
    );
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| AppError::BadRequest(format!("books dir {:?} unreadable: {e}", dir)))?;

    let mut items = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = std::fs::read_to_string(&path)
            .map_err(|e| AppError::BadRequest(format!("read {:?}: {e}", path)))?;
        let parsed:
            Result<Vec<KnowledgeIngestItem>, _> = serde_json::from_str(&raw);
        match parsed {
            Ok(mut list) => items.append(&mut list),
            Err(e) => {
                return Err(AppError::BadRequest(format!(
                    "{path:?} is not a books JSON array: {e}"
                )))
            }
        }
    }
    if items.is_empty() {
        return Err(AppError::BadRequest(format!(
            "no knowledge items found in {dir:?} — put an array of items in a .json file there"
        )));
    }
    Ok(items)
}
