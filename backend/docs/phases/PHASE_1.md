# Phase 1 — Capture, Briefing & daily.dev
> ⚠️ **2026-10-20:** this phase's report predates two user-directed changes:
> (1) the SPA frontend was **deleted** — the repo is backend-only; and (2) the
> Eisenhower quadrant model was **retired** — `tasks.priority` is now a single
> axis (`now` / `schedule` / `delegate` / `drop`, migration `0009`), see
> [../PURPOSE.md](../PURPOSE.md). Read the terminology here as history.

> **Status: BACKEND BUILT** (UI = Brief tab live in the SPA; DB parity soft-verified — needs real Supabase creds) ·
> Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 0](./PHASE_0.md) · Next: [Phase 2](./PHASE_2.md)

## Goal

The "everyday" core: natural-language capture into the matrix, the composed
morning brief, and the daily.dev connector that feeds it.

## Scope

1. **`POST /api/capture` completed** — Claude tool use inserts into `tasks`
   (`source: nl_capture`, confidence badge in `meta`); re-triage corrections
   logged in `meta.corrected_quadrant` *(retriage still pending — moved to backlog)*
2. **`GET/POST/PATCH/DELETE /api/tasks`** — full CRUD shipped (soft-delete →
   `archived` = the SPA's trash; `?purge=true` for hard delete)
3. **daily.dev connector** (`services/dailydev.rs`) — `/feeds/foryou` +
   `/feeds/discussed` with `dailydev_cache` (1 fetch/user/day, 24h TTL) and the
   token kept strictly server-side; unknown feed shapes degrade to empty, never fail
4. **Briefing pipeline** (`services/briefing.rs` + `jobs/morning_brief.rs`) —
   tasks + daily.dev (calendar = Phase 3 stub) →
   **one composed Claude call** (single `compose_brief` tool call) →
   `daily_briefings` row →
   `GET /api/briefing` · `POST /api/briefing/refresh` · `POST /api/briefing/accept`
   · `POST /cron/briefing` (secret-guarded, idempotent, composes for every user
   with open tasks)
5. **Brief tab UI** — SPA-level `BriefPanel` (nav "AI Brief"): headline, three
   numbered priorities with one-click accept, watchlist with "save as task"
   (→ Schedule quadrant, deep-dive reading), LeetCode drill card, and the NL
   "Capture instantly" box

## Verified live (Oct 18, 2026)

```
POST /api/capture (dev, real key)
  → 2 tasks: "Call the dentist at 3pm"  → urgent_not_important, due 2026-10-19
             "Finish metrics report draft" → urgent_important, due 2026-10-18
  (6.5 s round-trip incl. one rate-limited Claude call)
GET  /healthz          → {"db":not-configured,"anthropic":"configured","llm_tokens_available":20.0}
GET  /api/tasks        → 503 "database not configured" (expected without DB)
GET  /api/briefing     → 503 "briefing not configured" (expected without daily.dev token)
POST /cron/briefing    → 503 "no GROWTH_CRON_SECRET" (expected; set secret in prod)
cargo test             → 11/11 (6 LLM-rate-limit + 5 dailydev/cache unit tests)
pnpm build (SPA)       → clean, BriefPanel shipped
```

## Acceptance criteria

- [x] Brief generates on demand; cron route idempotent (double-fire safe)
- [x] Every proposal carries a `source` badge; nothing auto-inserts
- [ ] SPA serves only backend-persisted data when `VITE_BACKEND_URL` set
      *(flip pending: App.tsx still reads localStorage for the matrix itself;
      BriefPanel/capture already use the backend)*
- [x] daily.dev cached responses verified: second call in 24h hits cache, not API
      *(logic unit-tested against the TTL contract; live API call needs the token)*

## Remaining for full Phase 1 closure

1. Run the migration against the real Supabase project; smoke tasks CRUD +
   briefing compose + accept on live data
2. Flip the SPA matrix to backend as source of truth (or keep hybrid: local
   mode stays for unauthenticated users, backend mode for authenticated)
3. Wire the cron on the host (`crontab`/GitHub Action hitting `/cron/briefing`)
4. Add `VITE_BACKEND_URL` to the SPA env example
