# Phase 5 — Weekly Growth Review & RAG Re-weighting

> Status: **BACKEND BUILT (2026-10-19)** · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 4](./PHASE_4.md)

## Goal

The weekly loop that makes the copilot converge on you: review analytics on the
front end, feedback re-weighting (R5) on the RAG pipeline.

## Scope

1. **Weekly review job** — Saturday brief variant: completed vs carried-over
   tasks, quadrant balance shift, LeetCode stats deltas, inbox triage counts,
   which surfaced principles got accepted/rejected
2. **`GET /api/review/weekly}`** (+ dashboard tab): week-over-week trend charts
   (streak continuation, attempts/week, meetings density vs completion rate)
3. **RAG re-weighting job** — per [RAG_PIPELINE §7](../RAG_PIPELINE.md):
   `final_weight = base_weight * log(1 + accepted_count) / (1 + conflicts)`;
   underperforming principles are **deprioritized, never deleted** (quarantined
   via weight ≤ 0.1 while keeping corpus intact)
4. **Principle visibility** — admin route `GET /api/knowledge/weights`
   showing live influence of each of the 5 books' principles
5. **Golden-set evals in CI** — the retrieval tests from RAG §8 become part of
   the test suite; failures block prompts drift regressions

## Acceptance criteria

- [x] Weekly review contains zero hardcoded weights — all from `accepted_count`
- [x] Deprioritized principle provably stops surfacing in briefs (retrieval excludes `effective_weight ≤ 0.15`; the exclusion lives in the SQL, not a code branch)
- [x] Analytics endpoint stays fast — every number is a single aggregate query
- [x] Re-running the weekly job twice is idempotent — analytics recompute from source tables; the store is an upsert on `(user_id, week_start)`

## Implementation notes (2026-10-19)

**Built (backend only — SPA untouched):**

| Piece | Where |
|---|---|
| Migration: `weekly_reviews` (unique user/week), `knowledge_items.conflicts` + `effective_weight`, `knowledge_surface_log` provenance (R5/§5), RLS | `backend/migrations/0005_phase5_review.sql` |
| Weekly review service: SQL-only analytics (task completion + quadrant split + prev-week deltas, carried-over/overdue, LeetCode no-help-rate trend, inbox pulse, per-book principle engagement via surface log) + optional `compose_weekly_review` Claude verdict + idempotent upsert | `services/review.rs` — 3 unit tests (week-start math incl. year rollover) |
| Routes: `GET /api/review/weekly?week=` (live analytics + stored row), `POST /api/review/weekly/run` (compute + persist, headless without Anthropic) | `routes/review.rs` |
| Cron: `POST /cron/weekly` (secret-guarded, scans all active users), `POST /cron/reweight` (RAG §7) | `jobs/weekly_review.rs` |
| Re-weighting: `effective_weight = base × (1 + ln(1+accepted)) / (1+conflicts)`, quarantine (≥10 surfaces/30d, 0 accepts → 0.1, never deleted) | `services/rag.rs::reweight` |
| Retrieval now weights + filters: RRF score × `effective_weight`, quarantined (≤0.15) excluded; retrieval provenance logged per source (brief/capture/email) — best-effort, never blocks the feature | `services/rag.rs` |
| Admin visibility: `GET /api/knowledge/weights` (base vs effective, accepts, conflicts, surfaced-30d, quarantined count) | `routes/knowledge.rs` |
| Golden-set evals (RAG §8): CI-gated harness — run when `GROWTH_TEST_DATABASE_URL` + `GROWTH_TEST_EMBEDDINGS_KEY` exist, self-skip otherwise (never flakes secretless CI); hard-fails on top-3 relevance regressions | `tests/golden_set.rs` |

**Documented deviation (weight formula):** the raw §7 formula
`base × log(1+accepted) / (1+conflicts)` collapses ≥0-accept principles to
weight 0 on first run — quarantining the entire fresh corpus. Implementation
uses `base × (1 + log(1+accepted)) / (1+conflicts)` (neutral at zero accepts),
and quarantine is reserved for the explicit underperformer rule. Quarantine
and zero-deletion semantics follow the doc exactly.

**Live Supabase verification (2026-10-19):** migrations **0002–0005 applied
against the real database** (via `src/bin/apply_migration.rs` — no psql on this
box; note: Postgres has no `CREATE POLICY IF NOT EXISTS`, so 0005's RLS uses the
0001 pg_policies-guard idiom). Live round-trips confirmed with dev token:
analytics read, weights read, `run_weekly` upserted a Claude-composed verdict,
task create → complete → weekly aggregation picked it up (`completed: 1`, same
row overwritten — the upsert idempotency acceptance is live-verified too).
Still pending live: knowledge ingest/search round-trip (needs
`GROWTH_EMBEDDINGS_API_KEY`), reweight cron (needs `GROWTH_CRON_SECRET`).

**Schedulable cron pairs** (same `GROWTH_CRON_SECRET` guard):
```
0 6 * * *   curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" http://127.0.0.1:8000/cron/briefing
0 7 * * 6   curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" http://127.0.0.1:8000/cron/weekly
30 7 * * 6  curl -sf -X POST -H "x-cron-secret: $GROWTH_CRON_SECRET" http://127.0.0.1:8000/cron/reweight
```
