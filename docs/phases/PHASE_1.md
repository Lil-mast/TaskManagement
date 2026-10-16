# Phase 1 — Capture, Briefing & daily.dev

> Status: PENDING · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 0](./PHASE_0.md)

## Goal

The "everyday" core: natural-language capture into the matrix, the composed
morning brief, and the daily.dev connector that feeds it.

## Scope

1. **`POST /api/capture` completed** — Claude tool use inserts into `tasks`
   (`source: nl_capture`, confidence badge in `meta`); re-triage corrections
   logged in `meta.corrected_quadrant`
2. **`GET /api/tasks` CRUD parity** — move the SPA's direct Supabase calls
   behind the Rust routes (this flips the SPA to backend-mode)
3. **daily.dev connector** (`services/dailydev.rs`) — `/feeds/foryou` +
   `/feeds/discussed` with `dailydev_cache` (1 fetch/user/day, 24h TTL) and the
   token kept strictly server-side
4. **Briefing pipeline** (`jobs/morning_brief.rs` + routes) —
   tasks + calendar (stub in this phase) + daily.dev + LeetCode due list →
   **one composed Claude call** → `daily_briefings` row →
   `GET /api/briefing`, `POST /api/briefing/refresh`, `POST /api/briefing/accept`
5. **Brief tab UI** — dashboard widget: headline, top-3 priorities, watchlist
   with one-click "save as task", accept-to-matrix flow

## Acceptance criteria

- [ ] Brief generates before 07:00 via `/cron/briefing` (secret-guarded)
- [ ] Every proposal carries a `source` badge; nothing auto-inserts
- [ ] SPA serves only backend-persisted data when `VITE_BACKEND_URL` set
- [ ] daily.dev cached responses verified: second call in 24h hits cache, not API
