# PURPOSE.md — what we are building

> **Growth Copilot** — an AI daily operating system for one engineer's
> productivity and career growth. This is the anchor document: when anything
> else in the repo conflicts with what's written here, this file wins.

## The one-sentence version

Every morning the copilot gives MrT a grounded plan for the day from every
signal you feed it — your tasks, calendar, inbox, daily.dev tech trends,
study attempts, and the operating principles in its knowledge base — proposes
work instead of just storing it, and gets better at the job by observing what
you accept, do, and ignore.

## The product principle: propose, don't decide

The LLM never writes to the task pool on its own. Every AI output enters as a
**proposal** carrying a confidence, and a human accepts, edits, or rejects it.
This single rule (human-in-the-loop) shapes the whole API surface:

- `POST /api/capture` returns *proposals* only.
- `POST /api/email/triage` returns *proposals* only.
- The briefing composes guidance; it inserts nothing.
- Accepting a proposal (`/api/tasks`, explicit write) is the only way a task
  is created by AI — and even then the write binds to your verified identity.

## The priority model (no matrix)

Tasks carry a single `priority` axis, not an Eisenhower quadrant:

| Class | Meaning | Copilot behaviour |
|---|---|---|
| `now` | Time-critical *and* matters today — a real deadline, an interview, an outage | Headline of the daily brief; protected in planning |
| `schedule` | Long-term value: deep work, study, interview prep, learning loops | Gets planned *blocks* in the calendar; the growth engine |
| `delegate` | Time-critical but low impact — hand off, automate, minimize | Flagged for triage; not scheduled as personal work |
| `drop` | Recognizable noise | Nearby "not worth it"; surfaces in review as detected waste |

`now`/`schedule` map loosely to the matrix's "important" half, `delegate`/
`drop` to the noise — but there are no axes and no four-box board. The model
is a loop: **capture → classify → plan → do → review → re-weight**.

## What the copilot does (the loop, feature by feature)

1. **Morning brief** — one Claude-composed plan grounded in
   [grounding SQL](./ARCHITECTURE.md): today's tasks by priority, calendar
   mirror, unread inbox, **daily.dev trends (top `foryou` + `discussed`
   items)**, LeetCode wallet-of-patterns due today, your
   onboarding profile (focus areas, target interview date), and the two
   highest-weighted operating principles from the knowledge base. Cached,
   replayable, idempotent per day.
2. **Capture** — free text ("review the PRs before Friday") becomes
   classified, dated task *proposals* with `source: nl_capture` and
   confidence. Capture nudges with leading principles: before it disagrees
   with you, it shows you the rule it's applying.
3. **Tech trends — daily.dev** — the `foryou` and `discussed` feeds from the
   daily.dev Public API keep the copilot aware of what the industry is
   buzzing about. The token never leaves the server
   (`GROWTH_DAILY_DEV_TOKEN`); every feed is cached per user in
   `dailydev_cache` with a **24h TTL**, so the API is touched at most once
   a day per feed (force-refresh via `POST /api/integrations/dailydev/feeds`).
   Feeds are *grounding, not tasks* — the brief may propose "go deeper on
   <trend>" via normal capture proposals, never by writing tasks itself.
4. **LeetCode spaced repetition** — attempts update an SM-2-lite scheduler
   (`leetcode_patterns.next_review`), so "today's patterns" surface when
   memory decay says review, not when entropy says random.
5. **Calendar + Gmail** (consent-gated) — Google Calendar is a **read-only
   mirror** (`calendar_events` never becomes `tasks`); Gmail triage
   proposes email-derived tasks with `gmail_msg_id` dedup, so one email never
   becomes two tasks. Resource consent uses the backend's own Google OAuth
   client; sign-in identity is separate (Firebase).
6. **Knowledge loop** — a curated operating-principles corpus (authored
   JSON digests of real books, `data/books/`) embedded into
   `knowledge_items` + `knowledge_chunks` (pgvector). Retrieval is hybrid
   (vector ⊕ full-text, RRF-fused) and **weighted by your behavior**:
   accepted proposals raise an item's `effective_weight`; surfaces with no
   accepts quarantine it (weight → 0.1 → never retrieved). Saturday's
   weekly review (`/api/review/weekly`, `/cron/weekly`) verifies with
   Claude whether the week's evidence supports the verdict; `/cron/reweight`
   applies the weights. See [RAG_PIPELINE.md](./RAG_PIPELINE.md).
7. **Weekly review** — analytics (completions, priority breakdown, LeetCode
   streak, inbox backlog, brief views) + a grounded Claude verdict on
   whether this week moved the growth needle — cached on idempotent upsert.

## Hard invariants (non-negotiable, in priority order)

1. **Human-in-the-loop everywhere.** No AI path auto-inserts into the task
   pool or calendar.
2. **Identity from the token, never the body.** `user_id` is the verified
   Firebase `sub` journaled from `Authorization: Bearer` — no route takes it
   from a request body. Every query binds it; RLS
   (`app.current_user_id`) is the parallel backstop on the data plane.
3. **One LLM choke point.** All Claude traffic flows through
   `AnthropicClient::chat` — token bucket + concurrency semaphore +
   bounded retries. Deterministic fallbacks exist for every LLM outage.
4. **Secrets server-side only.** The daily.dev token, API keys, OAuth
   secrets — never in git, never in a bundle. The frontend (when rebuilt)
   ships only public `VITE_*` values.
5. **Mirrors are read-only.** Calendar events never mutate `tasks`. Email
   proposals dedup by message id.

## What it is NOT

- **Not a chatbot.** There is no free conversation with the copilot; the
  LLM is used as a pipeline step inside bounded flows, rate-limited and
  grounded.
- **Not a four-quadrant board.** The matrix framing is retired; the model
  is the priority loop above.
- **Not a multi-tenant SaaS in this repo.** This backend serves the
  product; there is no frontend here — the SPA was deleted 2026-10-20 and
  a client, whenever rebuilt, is a plain Bearer-token consumer of this API
  (contract: [../README.md](../README.md)).

## Stack and shape

- **Backend:** Rust / Axum (`backend/`), 40 tests, zero-warning build.
- **Data plane:** Supabase Postgres + pgvector via `GROWTH_DATABASE_URL`;
  RLS on all 13 canonical tables (baseline `0007`; live history through
  `0009_priority_classes.sql`).
- **Identity:** Firebase Auth (Google OAuth popup, email, phone) — the SPA
  SDK issues the ID token; the backend verifies RS256/JWKS with issuer
  binding. Supabase Auth support remains in code but unused.
- **LLM:** Anthropic (Claude) through the single client above; embeddings
  via `GROWTH_EMBEDDINGS_API_KEY` (RAG ingest gated until the key exists).
- **External signals:** daily.dev Public API (trends, `GROWTH_DAILY_DEV_TOKEN`),
  Google Calendar/Gmail (consent via the backend's own OAuth client).
- **Ops:** migrations via the project's own `apply_migration` bin (NOT
  `sqlx migrate run`); deploys as a distroless container on **Render**
  (`render.yaml`); crons are external HTTP calls (`/cron/briefing`,
  `/cron/weekly`, `/cron/reweight`) guarded by `x-cron-secret`.

## Reading order

1. This file.
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — how the pieces fit.
3. [FEATURES.md](./FEATURES.md) — the feature ledger and acceptance bars.
4. [RAG_PIPELINE.md](./RAG_PIPELINE.md) — the knowledge loop in detail.
5. [`phases/`](./phases/) — build history (phase 0 → 6) with per-phase
   evidence; terminology predating 2026-10-20 is history, not contract.
6. [`../README.md`](../README.md) — the complete API contract and config.
