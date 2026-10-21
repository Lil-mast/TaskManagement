# MrT API contract — SPA boundary

> Verified against the Rust route modules on 2026-10-21, not against the older
> README prose. When the backend changes, update this file and the Zod schema
> together.

Base URL: `VITE_API_BASE_URL` (default `http://localhost:8000`).
Auth: `Authorization: Bearer <Firebase ID token>`; local dev token `dev` is only
valid when the backend has no identity provider configured.
Errors: `{ "error": { "code": "...", "message": "..." } }`.

## Client conventions

- Every `/api` call is authenticated. `/healthz` is the only anonymous call.
- `401` → force one token refresh, retry once, then `AuthError`.
- `429` → `Retry-After` is parsed into `ApiError.retryAfter`; never auto-retried.
- `503` → degraded capability, not a blank page.
- Timeouts: 15s default, 30s sync/triage/ingest, 60s capture/brief.
- Durable payloads are validated with Zod. A mismatch throws `ContractError`.
- Proposals are never persisted by the client. Accepting is an explicit
  `POST /api/tasks` (or the briefing/email act endpoint).

## Endpoints

### Health

| Method | Path | Notes |
|---|---|---|
| GET | `/healthz` | `{ok, version, database, anthropic, auth_mode, llm_tokens_available}` |

### Tasks

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tasks?status=open\|done\|archived` | Only filter supported by the server |
| POST | `/api/tasks` | `{title, priority, description?, due_date?, tags?, source?}` |
| PATCH | `/api/tasks/{id}` | `description: null` / `due_date: null` clears; `tags: []` clears |
| DELETE | `/api/tasks/{id}` | Soft delete → archived |
| DELETE | `/api/tasks/{id}?purge=true` | Permanent |

Sources accepted on create: `user`, `ai_briefing`, `gmail`, `dailydev`,
`leetcode`, `nl_capture`.

### Capture

| Method | Path | Notes |
|---|---|---|
| POST | `/api/capture` | `{text, persist?: false}` → `{tasks[], saved_to_db?}` |

`persist` must stay `false` on product paths. A `true` is an internal-tool
opt-in and is the only way this route writes to `tasks`.

### Briefing

| Method | Path | Notes |
|---|---|---|
| GET | `/api/briefing` | Compose-or-reuse today's brief |
| POST | `/api/briefing/refresh` | `{refreshed, brief}` |
| POST | `/api/briefing/accept` | `{title, description?, priority?, due_date?, source?}` → `{accepted: uuid}` |

### LeetCode

| Method | Path | Notes |
|---|---|---|
| GET | `/api/leetcode/patterns` | Pattern library |
| POST | `/api/leetcode/patterns` | Upsert by `(user_id, name)` |
| POST | `/api/leetcode/patterns/{id}/delete` | Not `DELETE /patterns/{id}` |
| GET | `/api/leetcode/attempts?limit=` | Recent attempts |
| POST | `/api/leetcode/attempts` | Log attempt + reschedule + review task |
| GET | `/api/leetcode/stats` | Per-pattern attempts, no-help rate, average time |

There is no attempt-edit route.

### Email

| Method | Path | Notes |
|---|---|---|
| POST | `/api/email/triage` | Run triage (≤15 unseen threads) |
| GET | `/api/email/triage?state=open\|done\|task_created\|all` | List proposals |
| POST | `/api/email/triage/{gmail_msg_id}/act` | `{action:"done"}` or `{action:"task", task_title?}` |

The route lives under `/api/email`, not `/api/integrations/gmail/triage`.

### Calendar

| Method | Path | Notes |
|---|---|---|
| POST | `/api/calendar/sync` | `{synced_events}` |
| GET | `/api/calendar/events?days=7&fresh=` | Mirror, UTC ISO timestamps |
| GET | `/api/calendar/plan` | `{window, meeting_minutes, gaps, suggestions, note}` |

Suggestions carry `suggested_start`, but tasks still only store `due_date`.
Until `scheduled_start` exists, the UI must present an accept as a due-date write.

### Review

| Method | Path | Notes |
|---|---|---|
| GET | `/api/review/weekly?week=YYYY-MM-DD` | `{analytics, stored}` |
| POST | `/api/review/weekly/run` | Always runs the current week today |

### Profile & onboarding

| Method | Path | Notes |
|---|---|---|
| GET/PUT | `/api/profile` | `{name, target_interview_date, focus_areas}` |
| GET | `/api/onboarding` | Checklist + `next_steps` |
| POST | `/api/onboarding/seed` | Idempotent; refuses a non-empty pool |

### Integrations

| Method | Path | Notes |
|---|---|---|
| GET | `/api/integrations` | `{providers, calendar_events_cached, clients_configured}` |
| GET | `/api/integrations/dailydev/feeds` | 24h cache |
| POST | `/api/integrations/dailydev/feeds` | Force refresh |
| GET | `/api/integrations/google/url` | `{url}` |
| DELETE | `/api/integrations/google` | Revoke + wipe |
| GET | `/api/integrations/gmail/url` | `{url}` |
| DELETE | `/api/integrations/gmail` | Revoke; triage rows kept |
| GET | `/api/integrations/google/callback` | Backend redirect only; never fetched by the SPA |

### Knowledge

| Method | Path | Notes |
|---|---|---|
| POST | `/api/knowledge/ingest` | `{items?}` or `{}` to load `data/books` |
| GET | `/api/knowledge/items` | Corpus list |
| POST | `/api/knowledge/search` | `{query, k?}` |
| POST | `/api/knowledge/feedback` | `{item_id}` |
| GET | `/api/knowledge/weights` | `{items, quarantined, note}` |

## Drift corrected in this build

| Old claim | Reality now encoded in the client |
|---|---|
| Capture auto-persists proposals | `persist` defaults to `false` |
| Tasks list supports `since`/`limit` | Only `status` |
| `PATCH` cannot clear fields or edit tags | Tri-state `description`/`due_date`; `tags` supported |
| `POST /api/integrations/gmail/triage` | `POST /api/email/triage` |
| `/api/leetcode/attempt` + `PATCH` edit | `/api/leetcode/attempts`; no edit route |
| `POST /api/calendar/plan` | `GET /api/calendar/plan` |
| `POST /api/integrations/*/disconnect` | `DELETE /api/integrations/google` / `gmail` |
| Email action `convert_to_task` | `action: "task"` |
| Planner uses retired `not_urgent_important` | Now `schedule` |
| CORS allowed `allow_origin` only | Methods, headers, and `Retry-After` exposed |

## Known gaps, intentionally deferred

- `archived_at` is not returned; Trash shows `created_at` and must label it.
- No task pagination, tag filter, source filter, or bulk restore/purge.
- No attempt edit route.
- No `scheduled_start`/`scheduled_end`; calendar accepts are date-only.
- `POST /api/review/weekly/run` ignores `?week=`.
- No durable agent run log endpoint; the run strip stays session-only.
- No OpenAPI/ts-rs output; Zod schemas are the hand-maintained contract.
