# Phase 6 — Multi-User, Deploy & Auth Consolidation

> Status: PENDING · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 5](./PHASE_5.md)

## Goal

Friendly to a second user, deployed to a real host, and free of the dual
Firebase/Supabase identity debt.

## Scope

1. **Frontend auth hardening** — every byte of per-user data gated by RLS;
   `user_id` never trusts request bodies (always derived from the verified token)
2. **Onboarding** — first-run flow: sample tasks, "connect daily.dev",
   "connect Google" checklists; profile (name, target interview date, focus
   areas) feeding prompt assembly
3. **Auth consolidation** — migrate sign-in to **Supabase Auth** (Google provider
   covers both existing sign-in modes); Firebase removed
   (`core/auth.rs` re-targets Supabase JWTs); RLS pivots alongside; data
   migrated by UID mapping
4. **Cron on real host** — Phase 1 briefing `/cron/briefing` scheduled externally
   (system crontab on the Axum host or GitHub Actions); host secrets moved off
   `.env` into platform secret management
5. **Deploy** — Dockerfile (multi-stage Rust build → distroless), Fly.io/Railway,
   CORS locked to the production SPA origin, `/healthz` wired into host
   monitoring
6. **Observability** — tracing to stdout with sensible spans
   (`db`, `anthropic`, `rag` with sampling), error logging wired to structure
   rather than prints

## Acceptance criteria

- [ ] Second test account exists; sees none of admin's data, has own brief/calendar
- [ ] No Firebase dependency remains; auth Compiles on one provider
- [ ] Production deploy reachable at the SPA; briefing cron arrives on-host
- [ ] Load test: a burst of rate-limited Anthropic calls behaves via the singleton
      bucket, not per-request
- [ ] Secrets leave `.env` only via platform secret manager (no secret in git, ever)
