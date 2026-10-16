# Phase 4 — Gmail Inbox Triage

> Status: PENDING · Track: [ARCHITECTURE.md](../ARCHITECTURE.md) §7 · Prev: [Phase 3](./PHASE_3.md)

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
