# Phase 3 — Google Calendar Integration

> Status: PENDING · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 2](./PHASE_2.md)

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
