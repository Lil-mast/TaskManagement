# Phase 6 — Multi-User, Deploy & Auth Consolidation

> Status: **BACKEND BUILT (2026-10-20)** · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 5](./PHASE_5.md)

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
7. **Consolidated migration** — after the feature phases land, replace the
   incremental 0001–000N files with one clean baseline migration that:
   - drops any existing tables incompatible with the agents' actual functions
     (decision recorded 2026-10-19: e.g. pre-existing SPA tables the backend
     does not own, stale schemas no agent reads)
   - reflects the final canonical schema only
   - ships with a data-migration path or an explicit data-reset note

## Acceptance criteria

- [x] Second test account isolation is DB-enforced: every backend query binds the verified uid; RLS policies on all 13 per-user tables prevent cross-user reads even via direct SQL. (*A live two-browser session still needs the SPA handover to attach Bearer tokens.*)
- [x] No Firebase dependency remains — backend auth talks Supabase Auth (Google provider covers sign-in + calendar/gmail consents); Firebase survives only as an explicitly-gated migration window.
- [x] Production deploy reachable — Dockerfile + fly.toml + runbook; `/healthz` wired as host check. (*Actual first `fly deploy` remains a user action.*)
- [x] Load test: a burst behaves via the singleton bucket, not per-request (`tests/anthropic.rs::burst_shares_one_singleton_bucket`).
- [x] Secrets leave `.env` only via platform secret manager — nothing secret in git.

## Implementation notes (2026-10-20)

| Piece | Where / evidence |
|---|---|
| **Auth consolidation** — Supabase JWTs are the go-forward identity: RS256 verified via the project JWKS, legacy HS256 accepted only with `GROWTH_SUPABASE_JWT_SECRET`; per-source JWKS caches; precedence Supabase → Firebase (migration window) → dev token `"dev"` **only** when no provider configured | `core/auth.rs`, `core/config.rs` (`GROWTH_SUPABASE_URL`, `GROWTH_SUPABASE_JWT_SECRET`) |
| **SPA reality check (read-only; `src/` untouched)** | the SPA's Google sign-in already mints *Supabase* tokens (`src/lib/auth.tsx` → `lib/supabase.ts`); `lib/firebase.ts` is legacy; the SPA never calls the backend yet — handover only needs to attach `Authorization: Bearer <access_token>` |
| **Onboarding + profile** — `GET/PUT /api/profile`, `GET /api/onboarding` (checklist + next_steps), `POST /api/onboarding/seed` (idempotent sample task per quadrant; refuses on non-empty matrix) | `routes/onboarding.rs`, migration `0006_phase6_profiles.sql` (applied) |
| **Profile feeds prompt assembly** — live-verified: the brief cited *"your interview on 2026-12-01 … graphs or system design"* from the stored profile | `services/briefing.rs::ground_profile` |
| **Hardening audit** — grep audit: no route consumes `user_id` from request bodies; every query binds the verified uid; baseline's RLS loop covers `tasks` (previously policy-less) | `0007` §11 |
| **Consolidated baseline** — one clean canonical file, idempotent, verified as a no-op against the live DB; 0001–0006 archived under `migrations/archive/` | `migrations/0007_consolidated_baseline.sql` (applied) |
| **Legacy elimination** — applied 2026-10-20 with user confirmation: six SPA-era tables dropped; `public` now holds exactly the 13 canonical backend tables. Verified before dropping: 0 triggers, no live consumers server-side; SPA streak display now breaks until frontend handover | `migrations/0008_drop_spa_legacy.sql` |
| **Burst test** — 4 concurrent calls through one shared client: exactly `rpm` delivered, 4th throttled by the singleton bucket | `tests/anthropic.rs` |
| **Deploy** — multi-stage Dockerfile (deps-cached Rust slim → distroless cc nonroot), `fly.toml` (healthz check, CORS, scale-to-zero), runbook with cron + secrets guidance | `backend/Dockerfile`, `backend/fly.toml`, `backend/deploy/README.md` |
| **Observability** — `anthropic.chat`, `rag.ingest`, `rag.retrieve` instrumented spans | `services/anthropic.rs`, `services/rag.rs` |
| **Live smoke** — profile default→put→get; onboarding checklists + seed refusal; profile-grounded brief; 0006/0007/0008 applied against real Supabase | this session's transcripts |

## User-side switch-on list

1. `GROWTH_EMBEDDINGS_API_KEY` — RAG ingest/search/reweight (everything else degrades gracefully).
2. Google OAuth web client → `GROWTH_GOOGLE_CLIENT_ID/SECRET` (+ `GROWTH_TOKEN_ENC_KEY` already set).
3. `GROWTH_CRON_SECRET` — scheduled briefing/weekly/reweight jobs.
4. Books corpus JSON (5 books) → `/api/knowledge/ingest`.
5. `fly deploy` + crontab rows from `backend/deploy/README.md`.
6. SPA handover when ready (checklist in the Final report below).

## Final report (end of build out, 2026-10-20)

- Supabase round-trips live-verified across all phases (migrations 0002–0008
  applied; analytics, briefs, profile, onboarding, weights all read real DB;
  SPA-era tables eliminated per the recorded directive).
- Still user-side to switch on: `GROWTH_EMBEDDINGS_API_KEY` (RAG), Google
  OAuth client (calendar/gmail), `GROWTH_CRON_SECRET` (scheduled jobs),
  actual `fly deploy` when ready, and the books corpus JSON.
- SPA handover checklist (when the frontend is handed over): attach
  `Authorization: Bearer <supabase access_token>` (tokens already minted by
  the SPA's Google sign-in), replace `supabase client.ts` direct task calls
  with the backend API, point streak display at backend analytics, remove
  `lib/firebase.ts` leftovers.
