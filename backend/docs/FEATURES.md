# Growth Copilot — Features Document

> What the product does, feature by feature.
> ⚠️ **2026-10-20 rewrite:** the SPA frontend was deleted and the Eisenhower
> quadrant model retired. `tasks.priority` is a single axis —
> `now` / `schedule` / `delegate` / `drop` (see [PURPOSE.md](./PURPOSE.md)).
> Quadrant wording below predates the rewrite and survives as history. Companion docs:
> [ARCHITECTURE.md](./ARCHITECTURE.md) · [RAG_PIPELINE.md](./RAG_PIPELINE.md)
> **Stack:** React SPA · Rust/Axum backend · Supabase Postgres + pgvector ·
> Anthropic Claude (via Rig) · daily.dev API · Google Calendar + Gmail.

## 0. Product identity

**Growth Copilot** — an AI-powered daily operating system for a mid-level engineer's
productivity and career growth. Built around a priority loop (`now · schedule · delegate · drop`), powered by
Claude, fed by your calendar, your inbox, daily.dev, your LeetCode grind, and the
principles of five curated books.

Built as a personal tool first (dogfooding), multi-user-ready by design.

---

## 1. Feature matrix

| # | Feature | Status | Priority | Phase |
|---|---|---|---|---|
| F0 | Matrix board (retired 2026-10-20 — backend-only; the SPA was deleted) | — | — | — |
| F1 | AI Task Capture (natural language) | 🆕 new | P0 | 1 |
| F2 | AI Daily Briefing | 🆕 | P0 | 1 |
| F3 | LeetCode Interview Prep Module | 🆕 | P0 | 2 |
| F4 | Books → Principles Engine (RAG) | 🆕 | P0 | 2 |
| F5 | Google Calendar Integration | 🆕 | P1 | 3 |
| F6 | Gmail Inbox Triage | 🆕 | P1 | 4 |
| F7 | Weekly Growth Review | 🆕 | P2 | 5 |
| F8 | Multi-user mode | 🆕 | P2 | 6 |

---

## F1. AI Task Capture

**"The app you talk to, not a form you fill."**

- One composer input ("Capture") accepts free text:
  - *"call the dentist tomorrow 3pm, and finish the metrics report draft before Monday"*
  - *"[save this daily.dev post](url) as a deep-dive for Sunday"*
  - *"drop everything about the side project next week, mark my interview prep top priority"*
- Axum backend → Claude (tool use via Rig, `create_task` tool) returns validated
  structured JSON:
  tasks with title, description, **priority** (`now|schedule|delegate|drop`), due dates, tags, `source: nl_capture`
- Multi-task extraction in a single message (splits compound sentences)
- Assignment confidence badge on AI-created tasks (high/medium/low) — you can see
  how often the AI gets the priority right
- Undone? One-click "re-triage" sends a task back with your correction; corrections
  are logged to improve future prompting

**Acceptance**: 90%+ of simple captures produce the right priority + date; a capture
never silently drops a mentioned task.

## F2. AI Daily Briefing

**One composed brief every morning. Your day, decided before your first coffee.**

Rendered as a new **Brief** tab (default on open of the dashboard):

- **Headline** — one sentence on what kind of day this is
- **Top 3 priority order** — AI re-sorts your `now` items considering deadlines,
  calendar load, and overdue items, with a one-line *why* per item
- **Watchlist** — daily.dev: 3–5 posts worth reading *for you specifically* (from
  your personalized feed + what the community is debating), each with a verdict
  and **one-click "save as task"**
- **Inbox pulse** — 3 numbers: replies needed / FYI / possible tasks (from F6)
- **LeetCode drill** — today's pattern review (from F3)
- **Principles nudge** — one book-derived insight relevant to today's task mix (RAG)

**Acceptance**: brief is generated before 07:00; regenerates on demand; every
proposal carries a source badge and requires explicit accept.

## F3. LeetCode Interview Prep Module

**"Patterns, not problems."**

- **Pattern library**: curated list (two pointers, sliding window, binary search on
  answer, BFS/DFS, DP memoization, heap, backtracking, intervals…) with your own
  notes and personal "tricks" recorded per pattern
- **Attempt logging**: log URL, difficulty, time taken, hints needed ("needed_help")
  → feeds a spaced-repetition scheduler (SM-2 variant) that decides when to revisit
  the pattern
- **Review tasks in the matrix**: due reviews appear as tasks in the
  `schedule` — `source: leetcode`
- **Suggested drill**: picks the daily drill based on weak patterns, difficulty ramp
  (recent interview target date if set), and streak pressure
- **Stats**: attempts per pattern, success-without-help rate, difficulty distribution

**Acceptance**: logging an attempt always update the review schedule; the drill
recommendation reflects data, not random choice.

## F4. Principles Engine (Books → RAG)

Your five books become the AI's editorial voice, not a generic productivity bot.

- Books exported to JSON/Markdown in `backend/data/books/`
- Ingestion pipeline: parse → chunk → embed → store in `pgvector` (see
  [RAG_PIPELINE.md](./RAG_PIPELINE.md))
- At briefing & triage time, the most *context-relevant* principles are retrieved
  semantically and injected into the Claude prompt
- Each principle tracks `weight` and acceptance rate — feedback loop tunes

**Acceptance**: briefing prompts demonstrably cite book principles; a principle's
influence is adjustable per book.

## F5. Google Calendar Integration

- OAuth 2.0 (one "Connect Google" flow), tokens encrypted at rest
- Sync next 7 days of events → stored as read-only calendar blocks
- **Time-aware suggestions**: finds open gaps ≥ focus-block length and proposes
  scheduling the right task there ("you have 2 free hours at 14:00 — want to
  schedule the report rewrite?")
- Briefing uses real calendar load when re-sorting priorities
- Out-of-scope v1: writing events (read-only first), external attendee privacy
  preserved (titles only needed, no attendee emails in logs)

## F6. Gmail Inbox Triage

- Read-only by default; snippet-level classification of recent unread mail
- Categories: **Reply** / **FYI** / **Become a task** / **Ignore**
- Each triaged email → one-tap: open, mark done, or create matrix task
  (`source: gmail`)
- Full body fetched **only** when you open a specific message — nothing is
  silently processed
- Later (optional): AI drafts replies; send requires explicit user action

## F7. Weekly Growth Review

- Saturday brief variant: what shipped, priority distribution, LeetCode progress,
  which principles were used, book pages? → trend charts over weeks

## F8. Multi-user

- Data model is already per-`user_id` under RLS; add onboarding + per-user feeds.

---

## Build order

1. **Phase 1** — F1 + F2 (the "everyday" core: capture + briefing + daily.dev)
2. **Phase 2** — F3 + F4 (skills & principles)
3. **Phase 3** — F5 (calendar)
4. **Phase 4** — F6 (inbox)
5. **Phase 5** — F7 (review analytics)
6. **Phase 6** — F8 (multi-user polish)

Each phase ships usable value alone. Docs of record for what exists:
this file tracks status; the README is updated only when shipped.
