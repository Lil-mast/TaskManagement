# Phase 2 — LeetCode Prep Module & RAG Go-Live

> Status: **BACKEND BUILT (2026-10-18)** · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 1](./PHASE_1.md)

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

## Implementation notes (2026-10-18)

**Built (backend only — the SPA is off-limits per project rules):**

| Piece | Where |
|---|---|
| Migration: pgvector + `knowledge_chunks` (tsvector `lex` + HNSW + GIN), `knowledge_items.user_id`, `leetcode_patterns.meta` | `backend/migrations/0002_phase2_rag.sql` |
| Embeddings client (OpenAI-compatible, dim contract check) | `services/embeddings.rs` |
| Ingest (idempotent by content_hash; one idea ≈ one chunk ≤1800 chars) + hybrid RRF retrieval | `services/rag.rs` |
| Routes: `/api/knowledge/ingest` (body items or `data/books/*.json`), `/items`, `/search`, `/feedback` | `routes/knowledge.rs` |
| LeetCode: patterns upsert/delete, attempts log → SM-2-lite reschedule → review task in Schedule quadrant (`meta.leetcode_pattern_id` is reused, never duplicated) | `services/leetcode.rs`, `routes/leetcode.rs` |
| R2: capture retrieves top-2 principles into the system prompt | `routes/capture.rs` → `services/capture.rs` |
| R1: briefing grounds on PRINCIPLES (top-3 for today's tasks) + LEETCODE_DUE list | `services/briefing.rs` |

**Tests:** 22 passing — 12 unit (SM-2 math, chunker, sha256) + 6 Anthropic wiremock
+ 4 embeddings wiremock (`tests/embeddings.rs`: ordering, auth header, count/dim
mismatch, unconfigured short-circuit).

**Documented deviations from the original plan:**

1. **ts_rank stands in for BM25** — Postgres has no native BM25; the RRF fusion
   query uses `websearch_to_tsquery` + `ts_rank` over a generated tsvector.
   Swap to pg_search/pgroonga later without changing the API (retrieval stays
   one function).
2. **MMR diversification deferred** — with k ≤ 6 over a personal corpus of
   hundreds of chunks, RRF alone is sufficient; add MMR when the corpus grows.
3. **`knowledge_items` gained `user_id`** (the architecture doc had it global) —
   corpora are personal; RLS mirrors the tasks pattern.
4. **One chunk per item** (`unique index on knowledge_item_id`) — long ideas
   are truncated, never split mid-idea. Split-into-multiple-chunks is a later
   refinement if real books text (beyond distilled ideas) gets ingested.
5. **Embeddings provider** — Anthropic serves no embeddings; default is OpenAI
   `text-embedding-3-small` (1536-dim, matching the pin in migration 0002).
   Provider/model/dim are env-swappable via `GROWTH_EMBEDDINGS_*`.

**Still open (needs live Supabase):** run migration 0002, ingest real books
data, golden-set relevance check, idempotency check against real rows.
