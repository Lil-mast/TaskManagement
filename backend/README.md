# Growth Copilot Backend (Rust · Axum)

> AI-for-everyday Growth Copilot — Phase 0 scaffold.
> Design docs: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) ·
> [`../docs/FEATURES.md`](../docs/FEATURES.md) · [`../docs/RAG_PIPELINE.md`](../docs/RAG_PIPELINE.md) ·
> phase tracking in [`../docs/phases/`](../docs/phases/).

## What works right now

| Endpoint | Auth | Behavior |
|---|---|---|
| `GET /healthz` | none | Uptime probe: `{ok, version, database, anthropic, auth_mode, llm_tokens_available}` |
| `POST /api/capture` | Bearer | Free text → **Claude tool use** → discrete, Eisenhower-classified tasks. Persists to Postgres when `DATABASE_URL` is set (`source: nl_capture`), otherwise proposal-only |
| *(future)* `POST /api/capture/retriage` | — | Phase 1: one-click correction trains the classifier |

## Quickstart

```bash
cd backend
cp .env.example .env            # then fill GROWTH_ANTHROPIC_API_KEY
cargo run                       # → http://localhost:8000

# every /api route accepts the literal token "dev" while
# GROWTH_FIREBASE_PROJECT_ID is unset (dev mode, logged loudly)

curl -s localhost:8000/healthz

curl -s -X POST localhost:8000/api/capture \
  -H 'authorization: Bearer dev' \
  -H 'content-type: application/json' \
  -d '{"text": "review PRs tomorrow, plan my interview prep"}'
```

Gradual wiring — everything degrades gracefully, nothing 500s on missing config:

| Setting | When absent | When present |
|---|---|---|
| `GROWTH_ANTHROPIC_API_KEY` | capture 503s ("not configured") | capture end-to-end via Claude |
| `GROWTH_DATABASE_URL` | capture returns proposals only | tool results **insert into `tasks`** |
| `GROWTH_FIREBASE_PROJECT_ID` | dev auth only ("dev" → `local_dev`) | real `Bearer <Firebase ID token>` verification (JWKS + RS256, cached 30 min) |

Schema migration (run once in the Supabase SQL editor):
`backend/migrations/0001_phase0_schema.sql`

## Rate limiting — how Claude is protected

**All** Anthropic traffic goes through a single choke point:
`src/services/anthropic.rs::AnthropicClient::chat`. No route/job builds an LLM
request itself, so the guarantees below hold platform-wide:

| Control | Default | Behavior |
|---|---|---|
| Token bucket (`GROWTH_RATE_LIMIT_RPM`) | 20 req/min | Awaits (never errors) until a token frees |
| Concurrency (…_CONCURRENCY) | 3 | Max in-flight LLM calls, `tokio::sync::Semaphore` |
| 429/529 retry | `max_retries=4` | Honors `retry-after`; retries the identical payload |
| 5xx / transport retry | exponential + jitter | 1s→2s→4s…, fails after exactly `max_retries` |
| Other 4xx | fail-fast | The request is malformed — retrying cannot help |
| Prompt guard | `…MAX_INPUT_CHARS=60000` | Rejected **locally**, zero network cost |
| Output ceiling | `GROWTH_ANTHROPIC_MAX_TOKENS` | 4096 sent as `max_tokens` |

Tool use (not prose parsing): Claude must call the `create_task` tool with a
validated JSON schema; unparseable or unknown-enum responses become explicit
`AppError::Upstream` — they never silently corrupt data.

## Project layout

```
backend/
├── Cargo.toml                     # deps + profile.release (thin LTO)
├── .env.example                   # every variable, documented
├── migrations/0001_phase0_schema.sql
├── tests/anthropic.rs             # 6 integration tests (wiremock, no network)
└── src/
    ├── lib.rs                     # AppState, build_state, build_app
    ├── main.rs                    # thin async runner
    ├── core/
    │   ├── config.rs              # figment/env config + sentinel PORT fallback
    │   ├── auth.rs                # Bearer → AuthUser extractor
    │   └── error.rs               # AppError → typed HTTP responses
    ├── routes/
    │   ├── mod.rs                 # router assembly
    │   ├── health.rs              # /healthz
    │   └── capture.rs             # /api/capture + optional DB persistence
    └── services/
        ├── anthropic.rs           # ← single LLM path: bucket, slots, retries, tool parsing
        └── capture.rs             # prompt, tool schema, structured-task assembly
```

## Testing

```bash
cargo test
```

6/6 pass (wiremock spins a local mock server — the suite never touches the network):

| Test | Proves |
|---|---|
| `bucket_starts_full_and_drains` | RPM bucket blocks when drained (4th call waits) |
| `retries_on_429_with_retry_after_then_succeeds` | Rate-limit retry path + `retry-after` honored |
| `exhausts_retries_on_persistent_5xx` | Exactly `max_retries` attempts, then surfaced error |
| `tool_use_blocks_are_parsed` | Claude tool-use blocks → typed structs |
| `oversized_prompts_are_rejected_locally` | Zero network calls for oversized prompts |
| `request_body_never_omits_model_and_max_tokens` | Request shape contract |

## Deviations from the docs (deliberate)

1. **Firebase verification via `jsonwebtoken` + JWKS instead of the
   `firebase-admin` crate.** Same guarantees (RS256, `kid` lookup, `iss`/`aud`
   checks, TTL-cached JWKS) with no heavyweight admin SDK dependency. Documented
   here so nobody expects a `firebase-admin` entry in `Cargo.toml`.
2. **Runtime-checked SQL (`sqlx::query`) rather than `query_as!` macros.**
   Compile-time validation needs `DATABASE_URL` (or `cargo sqlx prepare` offline
   metadata) at build time; Phase 0 doesn't assume one. Switching the macros on
   is a Phase 1 task once Supabase creds live on the build host.
3. **`/api/capture` early-lands in Phase 0** (Phase docs planned it for Phase 1)
   because it is the fastest way to verify the rate-limited Claude integration
   end-to-end. Phase 1 completes it with persistence on by default + the SPA rewire.

## Next steps (Phase 1 — status: backend built, see `../docs/phases/PHASE_1.md`)

- ✅ `GET/POST/PATCH/DELETE /api/tasks` — shipped (soft-delete = trash)
- ✅ daily.dev connector + 24h cache — shipped
- ✅ morning brief: `GET /api/briefing` (+ refresh / accept / cron) — shipped
- ⬜ flip `sqlx` to compile-time-checked macros (needs DATABASE_URL on build host)
- ⬜ run migration 0001 against live Supabase; flip SPA to backend source of truth
