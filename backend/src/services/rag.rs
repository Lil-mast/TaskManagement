//! The Principles Engine — books (and later articles/corrections) → chunks →
//! pgvector, plus hybrid retrieval (vector cosine ⊕ lexical ts_rank, fused via
//! Reciprocal Rank Fusion). See RAG_PIPELINE.md.
//!
//! Idempotency: chunk `content_hash` (sha256) — re-ingesting the same books
//! JSON neither duplicates rows nor re-embeds unchanged text.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use super::embeddings::{to_pgvector_literal, EmbeddingClient};
use crate::core::error::{AppError, AppResult};

/// One idea ≈ one chunk. Long ideas still cap out (250–400 tokens ≈ 1–2k
/// chars); we never split mid-idea — oversize becomes its own chunk.
pub const MAX_CHUNK_CHARS: usize = 1_800;

/// Batch size for the embeddings API (documented: keep request bodies sane).
const EMBED_BATCH: usize = 32;

// ---------------------------------------------------------------------------
// Ingestion input (the books JSON format)
// ---------------------------------------------------------------------------

/// Shape of one ingest item (books export / manual capture):
/// `{ "book": "...", "chapter": "...", "idea": "...", "application": "...",
///    "tags": ["..."], "weight": 1.0 }`
#[derive(Debug, Deserialize)]
pub struct KnowledgeIngestItem {
    pub book: String,
    #[serde(default)]
    pub chapter: Option<String>,
    pub idea: String,
    /// when/how the AI should apply this principle (kept as a hint in `meta`)
    #[serde(default)]
    pub application: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub weight: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct IngestSummary {
    pub items_received: usize,
    pub items_new: usize,
    pub chunks_embedded: usize,
    pub chunks_skipped: usize,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct KnowledgeHit {
    pub id: uuid::Uuid,
    pub content: String,
    pub source_ref: String,
    pub score: f64,
}

#[derive(Clone)]
pub struct RagService {
    embeddings: EmbeddingClient,
}

impl RagService {
    pub fn new(embeddings: EmbeddingClient) -> Self {
        Self { embeddings }
    }

    pub fn is_ready(&self) -> bool {
        self.embeddings.is_configured()
    }

    // -----------------------------------------------------------------------
    // Ingestion
    // -----------------------------------------------------------------------

    /// Ingest books items (idempotent). Item identity is (user_id, book, idea)
    /// — re-running with the same JSON is a no-op; new ideas get embedded.
    #[tracing::instrument(name = "rag.ingest", skip_all, fields(user_id, count = items.len()))]
    pub async fn ingest(
        &self,
        pool: &PgPool,
        user_id: &str,
        items: &[KnowledgeIngestItem],
    ) -> AppResult<IngestSummary> {
        tracing::Span::current().record("user_id", user_id);
        if items.is_empty() {
            return Err(AppError::BadRequest(
                "no knowledge items provided (body items or data/books/*.json)".into(),
            ));
        }

        let mut summary = IngestSummary {
            items_received: items.len(),
            items_new: 0,
            chunks_embedded: 0,
            chunks_skipped: 0,
        };
        let mut pending: Vec<(uuid::Uuid, String)> = Vec::new();

        for item in items {
            let content = build_chunk_text(item);
            let existing: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT id FROM knowledge_items WHERE user_id = $1 AND book = $2 AND idea = $3",
            )
            .bind(user_id)
            .bind(item.book.trim())
            .bind(item.idea.trim())
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Database(format!("knowledge item lookup: {e}")))?;

            let item_id = match existing {
                Some(id) => {
                    summary.chunks_skipped += 1;
                    id
                }
                None => {
                    let chapter = item
                        .chapter
                        .as_deref()
                        .map(str::trim)
                        .filter(|c| !c.is_empty());
                    let id: uuid::Uuid = sqlx::query_scalar(
                        "INSERT INTO knowledge_items (book, chapter, idea, tags, weight, user_id)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         RETURNING id",
                    )
                    .bind(item.book.trim())
                    .bind(chapter)
                    .bind(item.idea.trim())
                    .bind(&item.tags)
                    .bind(item.weight.unwrap_or(1.0))
                    .bind(user_id)
                    .fetch_one(pool)
                    .await
                    .map_err(|e| AppError::Database(format!("knowledge item insert: {e}")))?;
                    summary.items_new += 1;
                    pending.push((id, content));
                    id
                }
            };
            let _ = item_id;
        }

        summary.chunks_embedded = self
            .embed_chunks(pool, user_id, &pending)
            .await?;
        Ok(summary)
    }

    /// Chunk rows for the given items, batch-embed the new/changed content,
    /// and persist vectors. Content hash guards re-embedding.
    async fn embed_chunks(
        &self,
        pool: &PgPool,
        user_id: &str,
        items: &[(uuid::Uuid, String)],
    ) -> AppResult<usize> {
        if items.is_empty() {
            return Ok(0);
        }

        // build chunk rows (only where none exists or the hash changed)
        let mut to_embed: Vec<(uuid::Uuid, String)> = Vec::new();
        for (item_id, content) in items {
            let body = truncate_chunk(content);
            let hash = sha256_hex(&body);
            let existing: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT id FROM knowledge_chunks
                 WHERE knowledge_item_id = $1 AND content_hash = $2",
            )
            .bind(item_id)
            .bind(&hash)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Database(format!("chunk lookup: {e}")))?;

            if existing.is_none() {
                to_embed.push((*item_id, body));
            }
        }
        if to_embed.is_empty() {
            return Ok(0);
        }

        // batch embeddings (N calls of ≤EMBED_BATCH)
        let mut vectors: Vec<Vec<f64>> = Vec::with_capacity(to_embed.len());
        for batch in to_embed.chunks(EMBED_BATCH) {
            let texts: Vec<String> = batch.iter().map(|(_, b)| b.clone()).collect();
            vectors.extend(self.embeddings.embed(&texts).await?);
        }

        // persist chunks with their vectors
        let mut embedded = 0;
        for ((item_id, body), vec) in to_embed.iter().zip(vectors) {
            let hash = sha256_hex(body);
            let literal = to_pgvector_literal(&vec);
            sqlx::query(
                "INSERT INTO knowledge_chunks
                   (knowledge_item_id, user_id, content, content_hash, meta, embedding)
                 VALUES ($1, $2, $3, $4,
                         jsonb_build_object(
                           'source_ref',
                           (SELECT book || COALESCE(' · ' || NULLIF(chapter, ''), '')
                            FROM knowledge_items WHERE id = $1)),
                         $5::vector)
                 ON CONFLICT (knowledge_item_id) DO UPDATE
                 SET content = EXCLUDED.content,
                     content_hash = EXCLUDED.content_hash,
                     embedding = EXCLUDED.embedding",
            )
            .bind(item_id)
            .bind(user_id)
            .bind(body)
            .bind(&hash)
            .bind(&literal)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(format!("chunk insert: {e}")))?;
            embedded += 1;
        }
        Ok(embedded)
    }

    // -----------------------------------------------------------------------
    // Retrieval (the one function the capture + briefing flows call)
    // -----------------------------------------------------------------------

    /// Hybrid: vector cosine (HNSW) ⊕ lexical ts_rank, fused with Reciprocal
    /// Rank Fusion (k=60). When embeddings are not configured this returns an
    /// empty list — features degrade gracefully, never hard-fail.
    ///
    /// Quarantined principles (effective_weight ≤ 0.15) never surface here —
    /// they stay in the corpus, they just stop showing up (PHASE_5 §3).
    /// `source` (brief|capture|email) is logged as retrieval provenance for
    /// the weekly re-weighting; anything else is logged nothing.
    #[tracing::instrument(name = "rag.retrieve", skip_all, fields(user_id, source, k))]
    pub async fn retrieve(
        &self,
        pool: &PgPool,
        user_id: &str,
        query: &str,
        k: usize,
        source: &str,
    ) -> AppResult<Vec<KnowledgeHit>> {
        tracing::Span::current()
            .record("user_id", user_id)
            .record("source", source)
            .record("k", k);
        let query = query.trim();
        if query.is_empty() || !self.is_ready() {
            return Ok(Vec::new());
        }

        // 1. embed the query (same model/dim as documents — contract)
        let qvec = self
            .embeddings
            .embed(&[query.to_string()])
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::Upstream("empty query embedding".into()))?;
        // plain floats — injection-safe
        let vec_literal = to_pgvector_literal(&qvec);

        // 2. fused SQL — websearch_to_tsquery parses the *raw* user string;
        //    ts_rank stands in for BM25 until a dedicated BM25 engine
        //    (pg_search/pgroonga) is warranted at ≥50k-chunk scale.
        let sql = r#"
WITH vector_results AS (
    SELECT id, 1 - (embedding <=> $1::vector) AS sim
    FROM knowledge_chunks
    WHERE user_id = $2 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3
),
lex_results AS (
    SELECT id, ts_rank(lex, websearch_to_tsquery('english', $4)) AS rank
    FROM knowledge_chunks
    WHERE user_id = $2 AND lex @@ websearch_to_tsquery('english', $4)
    ORDER BY rank DESC
    LIMIT $5
),
fused AS (
    SELECT id, 1.0 / (60 + ROW_NUMBER() OVER (ORDER BY sim DESC)) AS s FROM vector_results
    UNION ALL
    SELECT id, 1.0 / (60 + ROW_NUMBER() OVER (ORDER BY rank DESC)) AS s FROM lex_results
)
SELECT kc.id, kc.content, COALESCE(kc.meta->>'source_ref', '') AS source_ref,
       (SUM(f.s) * MAX(ki.effective_weight))::float8 AS score
FROM fused f
JOIN knowledge_chunks kc ON kc.id = f.id
JOIN knowledge_items ki ON ki.id = kc.knowledge_item_id
WHERE ki.effective_weight > 0.15
GROUP BY kc.id, kc.content, kc.meta, ki.effective_weight
ORDER BY score DESC
LIMIT $6
"#;

let fetch = (k.max(1) * 2) as i64;
        let hits = sqlx::query_as::<_, KnowledgeHit>(sql)
            .bind(&vec_literal)
            .bind(user_id)
            .bind(fetch)
            .bind(query)
            .bind(fetch)
            .bind(k.max(1) as i64)
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Database(format!("rag retrieve: {e}")))?;
        log_surface(pool, user_id, source, &hits).await;
        Ok(hits)
    }

    /// Feedback: on a user's accept, up the acceptance count of one principle.
    pub async fn upvote(&self, pool: &PgPool, user_id: &str, item_id: uuid::Uuid) -> AppResult<()> {
        sqlx::query(
            "UPDATE knowledge_items SET accepted_count = accepted_count + 1
             WHERE id = $1 AND user_id = $2",
        )
        .bind(item_id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("rag upvote: {e}")))?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Phase 5: weekly re-weighting (RAG_PIPELINE §7)
    // -----------------------------------------------------------------------

    /// Recompute `effective_weight` for every principle, then quarantine the
    /// underperformers.
    ///
    /// Formula (documented deviation from the raw §7 math in PHASE_5.md):
    ///   effective = base_weight × (1 + ln(1 + accepted_count)) / (1 + conflicts)
    /// — the `1 +` floor keeps never-accepted principles neutral (weight ≈
    /// base) instead of collapsing them outright.
    ///
    /// Quarantine: principles surfaced ≥ `QUARANTINE_SURFACES` times over 30
    /// days with zero accepts drop to 0.1 — corpus stays intact, retrieval
    /// just stops surfacing them (weight ≤ 0.15 is the exclusion line).
    pub async fn reweight(&self, pool: &PgPool) -> AppResult<usize> {
        let scored = sqlx::query(
            "UPDATE knowledge_items
             SET effective_weight =
                 GREATEST(0.1::real,
                          (weight::float8
                           * (1 + ln(1 + GREATEST(COALESCE(accepted_count, 0), 0))::float8)
                           / (1 + COALESCE(conflicts, 0)))::real)",
        )
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("reweight formula: {e}")))?;

        let quarantined = sqlx::query(
            "UPDATE knowledge_items ki
             SET effective_weight = 0.1
             WHERE ki.effective_weight > 0.1
               AND COALESCE(ki.accepted_count, 0) = 0
               AND (
                 SELECT COUNT(*) FROM knowledge_surface_log sl
                 WHERE sl.knowledge_item_id = ki.id
                   AND sl.surfaced_at >= NOW() - INTERVAL '30 days'
               ) >= $1",
        )
        .bind(QUARANTINE_SURFACES)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("reweight quarantine: {e}")))?;

        tracing::info!(
            formula = scored.rows_affected(),
            quarantined = quarantined.rows_affected(),
            "RAG re-weighting done"
        );
        Ok((scored.rows_affected() + quarantined.rows_affected()) as usize)
    }
}

/// Surfacing threshold for quarantine (30-day window).
pub const QUARANTINE_SURFACES: i64 = 10;

/// Retrieval provenance (§5): briefs/capture/email record what they surfaced
/// so weekly re-weighting can see acceptance-vs-surfacing. Best-effort —
/// logging failure must never break the feature that surfaced.
async fn log_surface(pool: &PgPool, user_id: &str, source: &str, hits: &[KnowledgeHit]) {
    if hits.is_empty() || !matches!(source, "brief" | "capture" | "email") {
        return;
    }
    let ids: Vec<uuid::Uuid> = hits.iter().map(|h| h.id).collect();
    let logged = sqlx::query(
        "INSERT INTO knowledge_surface_log (user_id, knowledge_item_id, source)
         SELECT $1, item_id, $2 FROM UNNEST($3) AS item_id",
    )
    .bind(user_id)
    .bind(source)
    .bind(&ids)
    .execute(pool)
    .await;
    if let Err(e) = logged {
        tracing::debug!(error = %e, "surface log write skipped");
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Chunk text = idea + (optional) application hint. Book attribution stays in
/// `meta.source_ref`, never inside the chunk text.
pub fn build_chunk_text(item: &KnowledgeIngestItem) -> String {
    let mut text = item.idea.trim().to_string();
    if let Some(app) = item.application.as_deref().map(str::trim) {
        if !app.is_empty() {
            text.push_str("\n\nWhen to apply: ");
            text.push_str(app);
        }
    }
    truncate_chunk(&text)
}

fn truncate_chunk(s: &str) -> String {
    s.chars().take(MAX_CHUNK_CHARS).collect()
}

pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Some Postgres installs lack `gen_random_uuid()` until pgcrypto shows up —
/// Supabase has it, so this is only a compile-time shape check.
#[allow(dead_code)]
fn uuid_shape_check(v: uuid::Uuid) -> uuid::Uuid {
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(idea: &str) -> KnowledgeIngestItem {
        KnowledgeIngestItem {
            book: "Deep Work".into(),
            chapter: Some("ch3".into()),
            idea: idea.into(),
            application: Some("Schedule the hardest task before 11am.".into()),
            tags: vec!["focus".into()],
            weight: Some(1.2),
        }
    }

    #[test]
    fn chunk_text_uses_idea_plus_application() {
        let text = build_chunk_text(&item("Focus beats busyness."));
        assert!(text.starts_with("Focus beats busyness."));
        assert!(text.contains("When to apply:"));
        assert!(text.chars().count() <= MAX_CHUNK_CHARS);
    }

    #[test]
    fn sha256_is_stable_and_hex() {
        let a = sha256_hex("hello");
        let b = sha256_hex("hello");
        assert_eq!(a, b);
        assert_ne!(a, sha256_hex("world"));
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn chunk_truncation_respects_limit() {
        let long = "x".repeat(5_000);
        assert_eq!(truncate_chunk(&long).chars().count(), MAX_CHUNK_CHARS);
    }
}
