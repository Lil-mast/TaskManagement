# Growth Copilot Backend (Rust · Axum · Postgres)

> AI daily productivity & career-growth copilot for mid-level engineers —
> **all phases (0–6) built**. Design docs: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md),
> [`../docs/RAG_PIPELINE.md`](../docs/RAG_PIPELINE.md), phase tracking in [`../docs/phases/`](../docs/phases/).
> Deploy runbook: [`deploy/README.md`](deploy/README.md).

**Stack:** Axum 0.8 · sqlx (runtime-checked) · Supabase Postgres (pgvector, RLS) ·
Claude (single rate-limited choke point) · OpenAI-compatible embeddings ·
Google Calendar + Gmail (Phase 3/4) · daily.dev connector.

## Quickstart

```bash
cd backend
cp .env.example .env            # fill at least GROWTH_ANTHROPIC_API_KEY + GROWTH_DATABASE_URL
cargo run                       # → http://localhost:8000  (three bins exist; server is default)

curl -s localhost:8000/healthz
```

**Auth:** every `/api` route takes `Authorization: Bearer <token>`. Provider
precedence: **Firebase Auth** (`GROWTH_FIREBASE_PROJECT_ID`) — the production
identity; the SPA signs in with the Google OAuth popup through Firebase and
sends the ID token, verified via JWKS (RS256, issuer-bound). **Supabase Auth**
verification stays available but unused (`GROWTH_SUPABASE_URL` is the data
plane only). Dev fallback: the literal token `"dev"` authenticates as
`local_dev` — **only** when no identity provider is configured.
`user_id` always comes from the verified token `sub`; request bodies never
carry identity.

**Schema:** on a fresh database run once
`cargo run --bin apply_migration -- migrations/0007_consolidated_baseline.sql`
(idempotent, complete). Files 0001–0006 are archived in `migrations/archive/`;
`0008_drop_spa_legacy.sql` (drops SPA-era tables) was applied 2026-10-20.

## API contract

| Endpoint | Method | Auth | Behavior |
|---|---|---|---|
| `/healthz` | GET | none | `{ok, version, database, anthropic, auth_mode, llm_tokens_available}` |
| `/api/capture` | POST | Bearer | Free text → Claude `create_task` tool → priority-classified task proposals (proposals; **never auto-inserts** into the matrix) → persists to `tasks` (`source: nl_capture`) |
| `/api/tasks` | POST/GET | Bearer | Create (title, **priority** ∈ `now|schedule|delegate|drop`, description?, due_date?, tags?) / list with `?status=&since=&limit=` |
| `/api/tasks/{id}` | PATCH/DELETE | Bearer | Edit (status transitions set `completed_at`) / soft-delete to trash (restore via PATCH) |
| `/api/briefing` | GET | Bearer | Today's brief (compose-or-reuse, idempotent) |
| `/api/briefing/refresh` | POST | Bearer | `{force:true}` recomputes |
| `/api/briefing/accept` | POST | Bearer | Accept a brief's work item → task (human-in-the-loop) |
| `/api/leetcode/patterns` | GET/POST | Bearer | Space-repetition list (SM-2-lite scheduling) |
| `/api/leetcode/patterns/{id}` | PATCH | Bearer | Update pattern |
| `/api/leetcode/attempt` | POST | Bearer | Log attempt; auto-schedules `next_review` |
| `/api/leetcode/attempt/{id}` | PATCH | Bearer | Correct an attempt → reschedules the pattern |
| `/api/knowledge/ingest` | POST | Bearer | Body `{items:[…]}` or empty → loads `data/books/*.json`; idempotent by sha256 of content |
| `/api/knowledge/items` | GET | Bearer | List the corpus (for admin/visibility) |
| `/api/knowledge/search` | POST | Bearer | Hybrid RRF retrieval (vector + `ts_rank`), quarantine-aware |
| `/api/knowledge/feedback` | POST | Bearer | "This principle earned its keep" → `accepted_count++` |
| `/api/knowledge/weights` | GET | Bearer | Live influence per principle (base vs effective weight, accepts, conflicts, surfaced-30d, quarantine) |
| `/api/integrations` | GET | Bearer | Integration connection states |
| `/api/integrations/dailydev/feeds` | POST | Bearer | Force-refresh the daily.dev cache (~15 feeds) |
| `/api/integrations/dailydev/feeds` | GET | Bearer | Cached feeds (24h TTL) |
| `/api/integrations/google/url` | GET | Bearer | Consent URL (consent includes calendar AND gmail scopes) |
| `/api/integrations/google/callback` | GET | signed state | OAuth return — `state` carries `(provider, user_id)`, signed (AES-GCM/HKDF) |
| `/api/integrations/google/disconnect` | POST | Bearer | Revoke + wipe stored token |
| `/api/integrations/gmail/triage` | POST | Bearer | Fetch ≤15 unseen threads (metadata + 140-char snippet only) → Claude `classify_emails` → `email_triage` proposals (idempotent by msg id) |
| `/api/email/triage` | GET | Bearer | List triage proposals (`state` filter) |
| `/api/email/triage/{id}/act` | POST | Bearer | `{action:"done"}` or `{action:"convert_to_task"}` (adds task `source: gmail`) |
| `/api/calendar/sync` | POST | Bearer | Horizon sync → `calendar_events` **mirror** (tasks rows never touched) |
| `/api/calendar/events` | GET | Bearer | Mirror read (upcoming window) |
| `/api/calendar/plan` | POST | Bearer | UTC-day planner: 09–18 focus windows ≥90 min; suggestions are proposals, ≤120 min |
| `/api/profile` | GET/PUT | Bearer | Name, target interview date, focus areas (feeds prompt assembly) |
| `/api/onboarding` | GET | Bearer | First-run checklist + next_steps |
| `/api/onboarding/seed` | POST | Bearer | One sample task per priority class — idempotent, refuses non-empty task pool |
| `/api/review/weekly` | GET | Bearer | `?week=YYYY-MM-DD` analytics: completion/priority-breakdown/LeetCode/inbox/principles + stored review |
| `/api/review/weekly/run` | POST | Bearer | Compute + upsert week's review (Claude verdict when configured, headless otherwise) |
| `/cron/briefing` | POST | cron secret | Morning brief for all active users (`x-cron-secret`) |
| `/cron/weekly` | POST | cron secret | Weekly review (Saturday) for all actives |
| `/cron/reweight` | POST | cron secret | RAG §7 re-weighting (`effective = base × (1 + ln(1+accepted)) / (1+conflicts)`, quarantine ≤0.1 — never deleted) |

## Config (`.env`, all prefixed `GROWTH_`)

Full list documented in `.env.example`. Highlights:

| Key | Notes |
|---|---|
| `GROWTH_DATABASE_URL` | Supabase Postgres (pooler). Graceful unset → DB features 503 |
| `GROWTH_ANTHROPIC_API_KEY` / `_MODEL` | LLM — model default `claude-sonnet-5-5` |
| `GROWTH_SUPABASE_URL` / `_JWT_SECRET` | OPTIONAL — Supabase is the data plane; its Auth is not used (Firebase is the provider) |
| `GROWTH_FIREBASE_PROJECT_ID` | **the sign-in provider** (SPA Google OAuth popup → Firebase ID token → verified via JWKS) |
| `GROWTH_EMBEDDINGS_API_KEY` / `_MODEL` / `_DIM` / `_BASE_URL` | default provider OpenAI `text-embedding-3-small` @1536-dim |
| `GROWTH_GOOGLE_CLIENT_ID/_SECRET/_REDIRECT_URL` | one OAuth client, two consents (calendar + gmail) |
| `GROWTH_TOKEN_ENC_KEY` | hex-32 AES-GCM master key (HKDF per-user keys for tokens at rest) |
| `GROWTH_CRON_SECRET` | required in production for `/cron/*` |
| `GROWTH_CORS_ORIGINS` | locked to the SPA origin (comma list) |
| `GROWTH_BOOKS_DIR` | ingest source dir (default `data/books`) |

## Guarantees

- **Single LLM choke point** — every Claude call goes through
  `services/anthropic.rs::chat`: token bucket (RPM), semaphore (in-flight cap),
  retry-429-with-`retry-after`, exponential 5xx backoff, local prompt-size
  guard. Burst behavior proven by test, never per-request buckets.
- **Human-in-the-loop** — nothing auto-writes the matrix; capture/triage/plan
  produce *proposals*; writes happen through explicit act/accept calls.
- **Token hygiene** — mirrored calendar/gmail events and snippets only
  (email body never fetched in v1); OAuth tokens encrypted at rest (AES-256-GCM,
  per-user HKDF); disconnect = revoke + wipe token (triage rows kept).
- **RLS everywhere per-user** — `user_id` policies on all 13 per-user tables;
  app-level queries always bind the verified uid. All work stays SQL via
  sqlx — no raw string interpolation of user data.

## Project layout

```
backend/
├── Cargo.toml                    # default-run = growth-copilot (3 bins)
├── .env.example                  # every variable, documented
├── Dockerfile                    # multi-stage → distroless cc
├── render.yaml                   # Render blueprint (Docker runtime, healthz)
├── deploy/README.md              # fly deploy, secrets, crontab
├── migrations/
│   ├── 0007_consolidated_baseline.sql   # ← canonical (idempotent, complete)
│   ├── 0008_drop_spa_legacy.sql         # destructive, applied 2026-10-20
│   ├── archive/0001–0006                # superseded incrementals
│   └── ...
├── data/books/                   # digested corpus JSONs + user PDFs (PDFs gitignored)
├── tests/                        # wiremock contracts (no real network)
│   ├── anthropic.rs              # bucket, retries, tool parse, burst singleton
│   ├── google.rs                 # consent/exchange/refresh/revoke contracts
│   ├── gmail.rs                  # metadata-only triage pipeline
│   ├── embeddings.rs             # provider contract
│   └── golden_set.rs             # CI-gated RAG relevance evals (skips w/o secrets)
└── src/
    ├── lib.rs                    # AppState, build_state, build_app (RAG snapshot)
    ├── main.rs                   # thin async runner
    ├── core/
    │   ├── config.rs             # figment/env config, PORT fallback for hosts
    │   ├── auth.rs               # Supabase→Firebase→dev Bearer extraction
    │   └── error.rs              # AppError → typed HTTP (some fields)
    ├── routes/
    │   ├── mod.rs                 # router assembly, every route nest
    │   ├── capture.rs            # NL capture + mail triage retriever hookup
    │   ├── tasks.rs              # matrix CRUD
    │   ├── briefing.rs           # morning brief routes
    │   ├── leetcode.rs           # patterns + attempts + SM-2-lite
    │   ├── knowledge.rs          # ingest/items/search/feedback/weights
    │   ├── integrations.rs       # daily.dev + google/gmail OAuth
    │   ├── calendar.rs           # sync/plan + mirror read
    │   ├── email.rs              # triage list/act
    │   ├── onboarding.rs         # profile + first-run flow
    │   ├── review.rs             # weekly analytics + run
    │   └── health.rs             # /healthz snapshot
    ├── services/
    │   ├── anthropic.rs          # ← single LLM path
    │   ├── capture.rs            # prompt + tool schema
    │   ├── dailydev.rs           # shape-tolerant connector + 24h cache
    │   ├── briefing.rs           # grounding + compose-or-reuse + accept
    │   ├── embeddings.rs         # OpenAI-compatible, swappable model/dim
    │   ├── rag.rs                # ingest (idempotent), hybrid RRF RAG, re-weight
    │   ├── leetcode.rs           # SM-2-lite (pure scheduler)
    │   ├── google.rs             # OAuth — consent/exchange/refresh/revoke
    │   ├── calendar.rs            # mirror + sync + planner config
    │   ├── planner.rs            # pure gap/fit math
    │   ├── email.rs              # gmail fetch/classify/upsert/act pipeline
    │   ├── review.rs             # weekly analytics + verdict + upsert
    │   └── crypto.rs             # AES-GCM tokens + signed state
    └── jobs/
        ├── morning_brief.rs      # /cron/briefing (CronSecret guard pub(crate))
        └── weekly_review.rs      # /cron/weekly + /cron/reweight
```

## Testing

```bash
cargo test                      # 40 tests, 0 warnings, no network (wiremock)
```

Highlights:
- `anthropic.rs` — bucket drain, retry-after 429, persistent-5xx exhaustion,
  tool parse, local guard, request shape, **burst shares one singleton bucket**
- `google.rs` — consent/exchange/refresh (scope-merging)/revoke via wiremock
- `gmail.rs` — fetch → one `classify_emails` call → idempotent upserts
- `embeddings.rs` — API contract; `golden_set.rs` — CI-gated top-3 relevance
  evals (self-skip without `GROWTH_TEST_DATABASE_URL` + `GROWTH_TEST_EMBEDDINGS_KEY`)
- unit tests for pure logic: planner gap math, SM-2 scheduler, week-start math,
  crypto round-trips

## Deliberate doc deviations (recorded)

1. **`jsonwebtoken` + JWKS** instead of `firebase-admin`/supabase-admin SDKs —
   same guarantees, no heavyweight dependency.
2. **Runtime-checked sqlx** (`query`/`query_as`) — no build-time DATABASE_URL
   requirement; switching to macros optional later.
3. **Phase 5 weight formula** — `base × (1 + ln(1+accepted)) / (1+conflicts)`
   (raw §7 collapses fresh corpus to zero on first run); quarantine is an
   explicit underperformer rule (≥10 surfaces/30d, 0 accepts → 0.1).
4. **Schema at-rest delta** — pre-migration legacy `user_id` default
   (`local_dev`) & original SPA base tasks remain grandfathered in live DB;
   baseline (fresh installs) has neither issue.

## Deploy

See [`deploy/README.md`](deploy/README.md) — **Render** Blueprint
(`render.yaml`, Docker runtime), secrets → Render environment (never
committed), `/cron/*` via Render Cron Job or GitHub Actions, `/healthz`
wired to Render monitoring.

## Not yet switched on (user-side)

- `GROWTH_EMBEDDINGS_API_KEY` → RAG ingest/search/reweight live (corpus JSONs ready in `data/books/`)
- Google OAuth client + secrets → calendar/gmail consents
- `GROWTH_CRON_SECRET` → scheduled jobs
- `render` blueprint deploy + cron rows
- SPA (frontend) handover to attach Bearer Supabase tokens (checklist in `../docs/phases/PHASE_6.md`)
