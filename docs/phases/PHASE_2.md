# Phase 2 — LeetCode Prep Module & RAG Go-Live

> Status: PENDING · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 1](./PHASE_1.md)

## Goal

The principles engine becomes real: books → chunks → pgvector, hybrid retrieval
wired into capture and the briefing; the LeetCode pattern library + spaced
repetition scheduling tasks directly in the matrix.

## Scope

1. **RAG ingestion** (`services/rag.rs` per [RAG_PIPELINE.md](../RAG_PIPELINE.md)):
   chunker (one idea ≈ one chunk, 250–400 tokens), embeddings API client,
   idempotent upsert into `knowledge_chunks` (content-hash dedup),
   `POST /api/knowledge/ingest`, `GET /api/knowledge/items`
2. **Embedding provider choice** (figment config; `text-embedding-3-small`
   1536-dim default). One model + one dim for docs **and** queries
3. **Hybrid retrieval into prompts** — RRF (vector cosine ⊕ BM25 over
   `chunk_terms`) + MMR diversification; feeding capture (R2) and briefing (R1)
4. **Feedback counters** — `accepted_count` updates when brief items are accepted
5. **LeetCode routes**: `/api/leetcode/patterns` (CRUD) +
   `/api/leetcode/attempts` (log → SM-2 reschedule of `next_review`,
   `ease`; review tasks created in the Schedule quadrant with `source: leetcode`)
6. **Prep tab UI** — pattern library, attempt log form, stats
   (attempts/pattern, success-without-help rate), drills calendar feed

## Acceptance criteria

- [ ] Re-running the books ingest results in idempotent row counts
- [ ] Golden set (20 principles + queries) passes top-3 relevance
- [ ] Prompt logs (debug route) verify hybrid retrieval is live in R1 + R2
- [ ] Logging an attempt always reschedules its pattern's review task
