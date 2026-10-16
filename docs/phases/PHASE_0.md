# Phase 0 — Backend Scaffold & LLM Foundation (Rust)

> **Status: IN BUILD** · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Next: [Phase 1](./PHASE_1.md)

## Goal

A memory-safe, rate-limited Anthropic integration running inside an Axum backend —
the foundation every later phase stands on. Ships without touching the SPA.

## Scope (in build order)

1. **Scaffold** `backend/`: Cargo.toml, Axum app, figment config, CORS, tracing, health endpoint
2. **Migrations**: full schema from ARCHITECTURE §3 (tasks extension + 6 domain tables;
   RAG tables land in Phase 2's migration — schema is additive, no re-work later)
3. **Claude client** (`services/anthropic.rs`): Messages API over reqwest,
   tool-use parsing, **rate limiting** (token bucket + concurrency semaphore +
   429/5xx retry with `Retry-After` backoff), token budget guard
4. **Landing route**: `POST /api/capture` — text → structured tasks via Claude
   tool use; DB persistence switches on automatically when `DATABASE_URL` is set
5. **Firebase ID token verification** (`core/auth.rs`): JWKS-based; dev-mode
   fallback when Firebase credentials are absent

## Rate limiting contract

| Control | Default (config) | Reduction to single code path |
|---|---|---|
| Requests/min | `RATE_LIMIT_RPM=20` | Token bucket, refill 20/min, awaits between calls |
| Parallel LLM calls | `RATE_LIMIT_CONCURRENCY=3` | `tokio::sync::Semaphore` |
| Retry on 429/529 | honor `retry-after` (fallback 2^n sec + jitter) | max 4 attempts |
| Retry on 5xx / timeout | backoff 1s→2s→4s | max 3 attempts |
| Prompt budget | ≈ 60k chars input ceiling | hard cap before send |
| Output budget | `ANTHROPIC_MAX_TOKENS=4096` | Messages payload |

All LLM traffic goes through one code path (`AnthropicClient::chat`) — no
route ever calls Anthropic directly.

## Acceptance criteria

- [x] `cargo build` green; `cargo test` green (6/6: bucket drain, 429 retry,
      5xx exhaust, tool-use parsing, prompt guard, request shape)
- [x] `/healthz` reports `{ database, anthropic, auth_mode, llm_tokens_available }`
- [x] Rate limit test: bucket blocks when drained (4th call waits for refill at rpm=3)
- [x] 429 simulation (wiremock) retries honoring `retry-after` then succeeds;
      persistent 5xx fails after exactly `max_retries` attempts
- [ ] Parity: `/api/tasks` CRUD matches existing direct-Supabase behavior (lands in Phase 1's rewire)

## Live smoke (verified)

```
GET  /healthz                                  → 200 { database: not-configured, anthropic: not-configured, auth_mode: dev }
POST /api/capture (Bearer dev, no LLM key)     → 503 capture service not configured
POST /api/capture (no bearer)                  → 401 missing bearer token
```

## Rollout notes

- Real keys: copy `backend/.env.example` → `backend/.env`, set
  `GROWTH_ANTHROPIC_API_KEY` (capture goes live), `GROWTH_DATABASE_URL` +
  run `migrations/0001_phase0_schema.sql` in Supabase (persistence goes live)
- No Firebase project id → dev auth: every `/api` route accepts the literal
  bearer token `dev` as user `local_dev` (logged loudly)
