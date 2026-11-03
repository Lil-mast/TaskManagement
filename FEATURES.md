# Features

## Overview

MrT is organized around eight surfaces, each answering a specific daily question. Here's what's built, what's in progress, and what's coming next.

| Surface | Status | Purpose |
|---|---|---|
| **Brief** | ✅ Live | What deserves today? |
| **Tasks** | ✅ Live | What did I decide to move? |
| **Capture** | ✅ Live | What am I carrying in my head? |
| **Workspace** | ✅ NEW | How fast can I solve it? |
| **Calendar** | 🏗️ In Progress | Where does it fit? |
| **Inbox** | 🏗️ In Progress | What needs action? |
| **LeetCode** | 🏗️ In Progress | Which pattern is due? |
| **Review** | 🏗️ In Progress | What actually moved? |
| **Principles** | 🏗️ In Progress | Why this advice? |

---

## ✅ LIVE: Brief

**Route:** `/brief`

The **Daily Brief** is the signed-in workspace hub. It composes an editorial morning brief from:

- Your open tasks (by priority)
- Your calendar (focus windows and events)
- Your inbox (incoming threads)
- Today's LeetCode pattern (if due)
- Daily.dev feed (curated tech news)

Every item in the brief is a **proposal** until you accept it. You can:
- ✅ Accept a task proposal → creates a task in your ledger
- ⏭️ Skip → propose a different task instead (compose-or-reuse model)
- ❌ Dismiss → re-compose the brief when ready

### API Endpoints
- `GET /api/briefing` — get today's brief (compose-or-reuse)
- `POST /api/briefing/refresh` — recompute the brief now
- `POST /api/briefing/accept` — accept a work item → task

### UI Components
- Brief header with date and mood
- Work items (tasks, calendar gaps, inbox highlights, LeetCode pattern)
- Daily.dev feed feed panel
- Ledger (quick task add)

---

## ✅ LIVE: Tasks

**Route:** `/tasks`, `/tasks/:id`

The **Task Ledger** is the single source of truth for what you've decided to do.

### Priority Axis
Every task has one priority:
- **`now`** — urgent, in focus, or blocked (finish this week)
- **`schedule`** — important but not urgent (fit into calendar when free)
- **`delegate`** — waiting on someone else
- **`drop`** — decided not to do (soft-delete to trash)

### Features
- ✅ Create task (title, description, priority, due date, tags, source)
- ✅ Edit task (PATCH updates any field; `null` clears description/due_date)
- ✅ List with filters (`?status=open|done|archived`)
- ✅ Board view (Kanban by priority)
- ✅ List view (table with search, sort, bulk actions)
- ✅ Optimistic complete/reopen/archive
- ✅ Deep link per task (`/tasks/:id`)
- ✅ Trash (soft-delete to `archived` status; restore or purge)

### API Endpoints
- `GET/POST /api/tasks`
- `GET/PATCH/DELETE /api/tasks/:id`
- `GET /api/tasks?status=open|done|archived`

### UI Components
- Task list (board and table views)
- Task drawer (full task detail + edit form)
- Search & sort controls
- Optimistic UI (instant visual feedback before server confirm)

---

## ✅ LIVE: Capture

**Route:** `/brief` (via ⌘K capture shortcut)

**Natural Language Capture** — type what's on your mind; MrT returns editable proposals.

### How It Works
1. User types natural language (e.g., "Fix the deploy script, it's failing on staging")
2. Claude `create_task` tool extracts proposals: title, priority (inferred), description, tags
3. User reviews proposals and selects which to write as tasks
4. Only selected proposals → database

**Key guarantee:** Nothing is silently written. Every proposal waits for your decision.

### API Endpoints
- `POST /api/capture` — NL text → Claude `create_task` tool → proposals (no persistence)
- `POST /api/tasks` — user explicitly creates task from proposal

### UI Components
- Capture modal (⌘K)
- Proposed task cards (editable)
- Accept/dismiss flow

---

## ✅ NEW: Workspace

**Route:** `/workspace`

**Code Execution Sandbox + MrT Debrief** — practice LeetCode patterns directly in the app.

### Run Code in 5 Languages

Write and execute code in Python, Rust, JavaScript, C, or C++. Every run is:
- ✅ Executed in a **short-lived Docker container** (128 MB, 0.5 CPU, 10s timeout)
- ✅ **Isolated** (no network access, read-only filesystem)
- ✅ **Persisted** to `workspace_submissions` table (every run is tracked)

**Supported languages:**
- Python 3.12
- Rust 1.78
- JavaScript (Node 20)
- C (GCC 13)
- C++ (GCC 13)

### Get MrT Debrief

After running code, get AI-powered feedback:

**Tone is automatic:**
- 🔥 **Hype** (Mr. T celebration) → clean solve, no hints, faster than average
- 🎓 **Mentor** (senior engineer analysis) → solved but asked for hints, or needs work

**Feedback includes:**
- What went right (or what to focus on if it failed)
- One concrete thing to improve next time
- AWS/systems complexity insight
- A **Pragmatic Programmer principle** woven in

**Example (hype):**
> "I pity the fool who takes longer than you on Two Pointers! That `O(n)` linear pass while maintaining your invariant — that's the move that scales to billions of events. Keep grinding!"

**Example (mentor):**
> "Your binary search boundary handling was clean — you correctly checked `mid` before accessing. Next time, before you code, spend 30 seconds naming the invariant: 'at every step, answer is in [left, right]'. If you can't name it, you're not ready to code it."

### Pragmatic Programmer Tips

10 curated principles embedded and biased by context:
- Tip 2: Think About Your Work
- Tip 4: Don't Live with Broken Windows
- Tip 8: Invest Regularly in Your Knowledge Portfolio
- Tip 9: Critically Analyze What You Read
- Tip 11: DRY — Don't Repeat Yourself
- Tip 14: There Are No Final Decisions
- Tip 15: Use Tracer Bullets
- Tip 18: Estimate to Avoid Surprises
- Tip 19: Iterate the Schedule
- Tip 24: Fix the Problem, Not the Blame

### Track Submissions

Every run is stored with:
- Code (full source)
- Language
- Stdout/stderr (truncated to 16 KB each)
- Exit code and timing
- Optional problem title/URL
- User ID and timestamp

### Integrate with LeetCode

Log an attempt after debrief:
- Triggers SM-2 scheduler
- Creates follow-up review task (if pattern needs it soon)
- Links submission to LeetCode attempt for analytics

### API Endpoints
- `POST /api/workspace/run` — execute code, returns `submission_id`
- `POST /api/workspace/debrief` — analyze solve, return MrT feedback

### UI Components
- **Code editor** (CodeMirror 6, syntax highlighting, language tabs)
- **Run panel** (execution output: stdout/stderr)
- **Language switcher** (Python/Rust/JS/C/C++, resets code to template)
- **Debrief panel** (MrT message + tip + Log Attempt button)
- **MrT sidebar** (LeetCode stats, daily inspiration, practice tips)

### Deployment Checklist

For `/workspace/run` to work:
1. Docker running on host
2. Language images pre-pulled (~500 MB total)
3. `GROWTH_WORKSPACE_ENABLED=true` in `.env`
4. `GROWTH_DATABASE_URL` set (migration applied)

See [backend README — Workspace section](backend/README.md#workspace--leetcode-code-execution-sandbox) for full setup.

---

## 🏗️ IN PROGRESS: Calendar

**Route:** `/calendar` (coming)

Syncs your Google Calendar and finds **real gaps** in the week where focus work fits.

### Planned Features
- Sync Google Calendar events
- Find 90+ minute focus windows
- Schedule suggestions (proposals until you accept)
- Plan your week with time allocation
- Block time for DSA practice

### API Endpoints (Partial)
- `POST /api/integrations/google/url` — get consent URL
- `POST /api/integrations/google/callback` — OAuth return
- `POST /api/calendar/sync` — mirror events to `calendar_events` table
- `GET /api/calendar/events` — read mirrored events
- `GET /api/calendar/plan` — compute focus windows

---

## 🏗️ IN PROGRESS: Inbox

**Route:** `/inbox` (coming)

Gmail triage — classify incoming threads as `reply`, `fyi`, `task`, or `ignore`.

### Planned Features
- Fetch unseen Gmail threads
- Claude classifies each thread
- Create tasks from actionable emails
- Mark as done or FYI
- Archive resolved threads

### API Endpoints (Partial)
- `POST /api/integrations/gmail/url` — get Gmail consent
- `POST /api/email/triage` — fetch threads, classify via Claude
- `GET /api/email/triage` — list proposals
- `POST /api/email/triage/:msg_id/act` — act on proposal (task/done/ignore)

---

## 🏗️ IN PROGRESS: LeetCode

**Route:** `/patterns` (coming)

Spaced repetition of algorithm patterns using SM-2 scheduler.

### Planned Features
- Pattern list (confidence, attempts, no-help rate)
- Space repetition scheduler (SM-2 algorithm)
- Scheduled practice tasks (auto-created when due)
- Linked to Workspace sandbox (log attempts)
- Analytics (performance per pattern, time trends)

### API Endpoints (Partial)
- `GET/POST /api/leetcode/patterns`
- `POST /api/leetcode/patterns/:id/delete`
- `GET/POST /api/leetcode/attempts`
- `GET /api/leetcode/stats`

---

## 🏗️ IN PROGRESS: Review

**Route:** `/review` (coming)

Weekly analytics — what moved, what didn't, where to improve.

### Planned Features
- Weekly completion rate
- Priority breakdown (tasks completed per priority)
- LeetCode progress (attempts, no-help rate)
- Inbox state (unread, resolved, pending)
- Prep trend (are you getting faster?)

### API Endpoints (Partial)
- `GET /api/review/weekly?week=YYYY-MM-DD`
- `POST /api/review/weekly/run` — compute + store weekly review

---

## 🏗️ IN PROGRESS: Principles

**Route:** `/principles` (coming)

Searchable corpus of book ideas and principles from your reading.

### Planned Features
- Ingest PDFs and JSON documents (book summaries)
- Vector search via embeddings
- Weighted by what's earned its keep (high-utility principles surface first)
- Linked to brief context (why is this principle relevant today?)
- Feedback loop (mark principle as useful, increase weight)

### API Endpoints (Partial)
- `POST /api/knowledge/ingest` — load corpus from `data/books/*.json`
- `GET /api/knowledge/items` — list corpus
- `POST /api/knowledge/search` — hybrid RRF retrieval
- `POST /api/knowledge/feedback` — mark as useful
- `GET /api/knowledge/weights` — live influence per principle

---

## 🔐 Shared Features (All Surfaces)

### Authentication
- Firebase ID tokens (production) + Google OAuth
- Dev-token mode (`Bearer dev`) for local development
- Account allowlist for invite-only access
- Per-user rate limits (LLM calls, API quota)

### Data Ownership
- Every surface enforces **Row-Level Security (RLS)** in Postgres
- Users see only their own data
- `user_id` comes from verified token `sub`, never user input

### Observability
- `/healthz` endpoint reports database, LLM, auth, version
- Structured logs (Rust `tracing`)
- Optional: Sentry for error tracking (not yet integrated)

### Rate Limiting
- **LLM:** Per-user bucket (default 10 calls/hour; 60 calls/min globally)
- **API:** Per-user request rate (60 RPM default)
- **Capture/Debrief:** Count against LLM quota

---

## 📱 Responsive Design

All surfaces are built mobile-first:
- ✅ Touch-friendly controls
- ✅ Tap highlight feedback
- ✅ Bottom sheet (mobile nav)
- ✅ Responsive grid (desktop board, mobile list)
- ✅ No `100vh` bugs or layout shifts

---

## 🧪 Testing

- **Backend:** 40+ tests, wiremock contracts for external services (no real network)
- **Frontend:** Vitest unit tests, MSW (Mock Service Worker) for API contracts
- **E2E:** Manual testing on Chrome desktop + Safari mobile (planned: Playwright)

---

## 🚀 What's Next

**Phase priorities (in order):**

1. **Calendar + Focus planning** — sync Google Calendar, find gaps, schedule DSA practice
2. **Inbox + Gmail triage** — classify incoming threads, auto-create tasks
3. **LeetCode patterns + SM-2** — practice scheduler, linked to Workspace submissions
4. **Weekly review** — analytics dashboard, performance trends
5. **Principles corpus** — search-and-link book ideas to brief context

---

## 📚 Documentation

- [Backend API contract](backend/README.md#api-contract)
- [Frontend screens](FRONTEND.md)
- [Architecture](backend/docs/ARCHITECTURE.md)
- [Database schema](backend/migrations/)
- [RAG pipeline](backend/docs/RAG_PIPELINE.md)
- [Workspace sandbox details](backend/README.md#workspace--leetcode-code-execution-sandbox)
- [Migrations guide](backend/docs/MIGRATIONS.md)

