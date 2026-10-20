# Phase 3 — Google Calendar Integration
> ⚠️ **2026-10-20:** this phase's report predates two user-directed changes:
> (1) the SPA frontend was **deleted** — the repo is backend-only; and (2) the
> Eisenhower quadrant model was **retired** — `tasks.priority` is now a single
> axis (`now` / `schedule` / `delegate` / `drop`, migration `0009`), see
> [../PURPOSE.md](../PURPOSE.md). Read the terminology here as history.

> Status: **BACKEND BUILT (2026-10-19)** · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 2](./PHASE_2.md)

## Goal

The matrix learns your real week: calendar events become context the AI plans
around, and open gaps get honest scheduling suggestions.

## Scope

1. **OAuth 2.0** — consent URL route, callback route, `integrations` row with
   AES-GCM-encrypted refresh token (per-user derived key, HKDF on a server secret);
   `getValidGoogleToken()` centralizes refresh, every call site uses it
2. **Event sync** (`services/google_calendar.rs`) — next 7 days of events →
   calendar blocks (title, start, end, busy?) in `tasks`/separate `calendar_events`
   handling per ARCHITECTURE; sync is user-triggered + invoked by briefing job
3. **Time-aware suggestions** — `GET /api/calendar/plan` finds gaps ≥ a focus
   block ("2h free at 14:00 — schedule the report rewrite?") and proposes
   `due_date` + time for unscheduled "Schedule"-quadrant tasks
4. **Briefing integration** — priority re-sorting by real calendar load
   (overdue + due-today + meeting density) — replaces the Phase 1 stub
5. **Profile handling** — only event titles/dates are persisted (no attendee
   emails to logs); connection revocable from the dashboard

## Acceptance criteria

- [ ] Connect flow round-trips: consent → callback → encrypted token row
- [ ] Synced events visible on dashboard; revoking clears data + token
- [ ] Expired token refresh happens transparently inside one request
- [ ] Briefing priorities change demonstrably when a heavy meeting day is added

## Implementation notes (2026-10-19)

**Built (backend only — SPA untouched):**

| Piece | Where |
|---|---|
| Migration: `calendar_events` mirror (title+times only, no attendees) + **integrations re-key to (user_id, provider)** — the old `PK(user_id)` allowed exactly one integration per user, contradicting calendar+gmail | `backend/migrations/0003_phase3_calendar.sql` |
| AES-256-GCM token encryption, HKDF per-user keys; HMAC-signed expiring OAuth `state` (identity for the unauthenticated callback) | `services/crypto.rs` — 6 unit tests |
| OAuth consent URL / code exchange / **silent refresh** via the single `get_valid_token` choke point; Calendar v3 list (next 7 days); revocation | `services/google.rs` |
| Sync → `calendar_events` upsert; disconnect = revoke + wipe token & mirror; cached mirror read | `services/calendar.rs` |
| Routes: `GET /api/integrations`, `GET /api/integrations/google/url`, `GET /api/integrations/google/callback`, `DELETE /api/integrations/google`, `POST /api/calendar/sync`, `GET /api/calendar/events`, `GET /api/calendar/plan` | `routes/integrations.rs`, `routes/calendar.rs` |
| Pure gap math: merge busy blocks → working-window gaps ≥ 90 min → greedy suggestions (capped 120 min, **proposals only — nothing auto-schedules**) | `services/planner.rs` — 6 unit tests |
| Briefing grounding gains `CALENDAR (next 7 days)`; system rules now demand priorities fit around meeting load | `services/briefing.rs` |

**Test total: 34 passing** (24 unit incl. crypto + planner, 6 Anthropic wiremock,
4 embeddings wiremock). Boot smoke: `/healthz` healthy; calendar routes 503
cleanly when Google not configured.

**Documented deviations:**

1. **`calendar_events` is a separate mirror table** (not tasks rows) — calendar
   blocks were never meant to be user tasks; injecting them into `tasks` would
   corrupt the SPA's source of truth. The `plan` route is the writer-free path.
2. **`planner` timezone is UTC-only** with fixed 09–18 UTC working windows for
   now — real per-user timezones arrive with the profile flow (Phase 6);
   the pure functions take windows as a parameter, so the change is contained.
3. **Phase 4 Gmail** consents separately into its own `integrations` row
   (`provider = 'gmail'`) — the re-keyed table makes this free.
4. Callback identity: the signed `state` parameter (HMAC + 10-min expiry)
   replaces a bearer token; tampering/expiry is rejected with 401.

**Blocked on live Supabase + Google OAuth client:** run migration 0003,
create OAuth credentials (redirect URI per `.env.example`), then the connect →
sync → plan round-trip can smoke-tested for real.
