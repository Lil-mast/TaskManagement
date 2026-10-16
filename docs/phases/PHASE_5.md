# Phase 5 — Weekly Growth Review & RAG Re-weighting

> Status: PENDING · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 4](./PHASE_4.md)

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

- [ ] Weekly review contains zero hardcoded weights — all from `accepted_count`
- [ ] Deprioritized principle provably stops surfacing in briefs
- [ ] Analytics endpoint stays fast — aggregation is SQL, never N+1 loops
- [ ] Re-running the weekly job twice is idempotent (no double-counting)
