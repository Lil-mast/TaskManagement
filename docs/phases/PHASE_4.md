# Phase 4 — Gmail Inbox Triage

> Status: **BACKEND BUILT (2026-10-19)** · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 3](./PHASE_3.md)

## Goal

The busiest drain — email — gets surfaced as decisions, not noise. The AI classifies,
the app shows, the human acts.

## Scope

1. **Read-only Gmail scope** added to the Google integration flow
   (`gmail.readonly`; no send, no modify)
2. **`POST /api/email/triage`** — fetch ~15 recent unread msgs
   (metadata + snippets only) → Claude tool use classifies into
   **Reply / FYI / Become a task / Ignore** with a one-line summary →
   `email_triage` rows (dedup on `gmail_msg_id`)
3. **Inbox pulse in the briefing** — 3 counters + top items; R4 retrieval (from
   Phase 2's RAG) supplies your personal triage rules ("reply-style emails from
   maintainers always get Reply")
4. **Actions** — `POST /api/email/triage/{id}/act`: mark done / convert to a
   matrix task (`source: gmail`); full message body is fetched **only** when the
   user explicitly opens that message
5. **Inbox tab UI** — categorized list, one-tap actions, "open original" link;
   drafts/send remains out of scope v1 (future: `gmail.send` per-user opt-in)

## Acceptance criteria

- [ ] Token/account privacy: no message body ever persisted, aborts on body fetch
- [ ] Re-triage is idempotent (same Gmail id doesn't double-triage)
- [ ] Every reply-needing email visible in inbox tab until marked done
- [ ] Inbox pulse numbers inside the brief match actual `email_triage` state

## Implementation notes (2026-10-19)

**Built (backend only — SPA untouched):**

| Piece | Where |
|---|---|
| Migration: `email_triage.subject` + `state` (`open`→`done`/`task_created`) + index | `backend/migrations/0004_phase4_gmail.sql` |
| Token layer generalized per provider: signed state now carries `(provider, user_id)`; refresh is scope-merge (`COALESCE(EXCLUDED.scopes, ...)`) so refreshes never clobber scope lists | `services/crypto.rs`, `services/google.rs` |
| Gmail read-only service: unread inbox list (≤15), metadata+snippet only (**snippet capped at 140 chars — never bodies**), one `classify_emails` tool call, `ON CONFLICT (gmail_msg_id) DO NOTHING` idempotency, act (`done` / convert→task `source: gmail`) | `services/email.rs` |
| Routes: `POST /api/email/triage`, `GET /api/email/triage?state=`, `POST /api/email/triage/{msg_id}/act`, `GET /api/integrations/gmail/url`, `DELETE /api/integrations/gmail`; callback dispatches consent→(calendar \| gmail) via the signed state's provider field | `routes/email.rs`, `routes/integrations.rs` |
| R4: personal triage rules retrieved from the knowledge base (Phase 2 RAG, silent degradation) into the classify prompt | `routes/email.rs` |
| Inbox pulse grounding: `email_triage` counts + top subjects per category; brief rules now explicitly forbid inventing email work as priorities | `services/briefing.rs` |

**Test total: 37 passing** — 25 unit (incl. provider-aware state sign/verify),
6 Anthropic + 2 Gmail wiremock (metadata-only contract: snippet truncation,
Subject/From extraction, empty-inbox short-circuit, `format=metadata` enforced
via matched query params), 4 embeddings.

**Documented deviations:**

1. **No full-message-body route in v1** — the phase doc fetches bodies only on
   explicit open; v1 exposes no open route at all (metadata + snippet is
   sufficient for classification decisions). Wiremock test pins this contract.
2. **`task` conversion defaults to `urgent_important`** — email deadlines are
   usually real; the human can drag it in the SPA. `meta.gmail_msg_id` links
   back to the triage row.
3. Gmail metadata GETs are bounded (15/run, sequential) and exempt from the
   Anthropic token bucket — the bucket guards LLM spend, not Google reads;
   the classify step still goes through the LLM choke point.
4. Disconnect keeps triage rows (they are the user's decisions, not Google
   data); only the token row is dropped.

**Blocked on live Supabase + Google OAuth client (same for Phase 3 & 4):**
run migrations 0002–0004, create the OAuth web client with the documented
redirect URI, then: connect → sync → plan, connect gmail → triage → act.
