# MrT — Daily Intelligence

> **MrT proposes. You decide.**

![MrT daily intelligence dashboard](asset/screen.png)

MrT is a personal daily-intelligence workspace for people who are trying to do
focused work while also preparing for the next step in their career. It reads
the signals around you — tasks, calendar, inbox, daily.dev, LeetCode practice,
and your own principles — and turns them into one editorial morning brief.

It is **not** an autonomous task robot. Every suggestion is a proposal until
you accept, edit, or dismiss it.

## What it is

| Surface | The question it answers |
|---|---|
| **Brief** | *What deserves today?* One headline, a short priority list with a reason per item, a watchlist, and today's drill. |
| **Tasks** | *What did I decide to move?* One priority axis: `now`, `schedule`, `delegate`, `drop`. |
| **Capture** | *What am I carrying around in my head?* Type natural language; MrT returns discrete proposals, never silent writes. |
| **Calendar** | *Where does it fit?* Real gaps in the week, plus schedule suggestions that remain proposals. |
| **Inbox** | *What needs a reply, a task, or nothing?* Gmail triage returns `reply`, `fyi`, `task`, or `ignore` decisions. |
| **LeetCode** | *Which pattern is due?* Pattern confidence, attempts, no-help rate, and spaced review. |
| **Review** | *What actually moved?* Weekly completion, priority breakdown, inbox state, and prep trend. |
| **Principles** | *Why this advice?* A searchable corpus of book ideas, weighted by what has earned its keep. |

### The loop

```mermaid
flowchart LR
  C[Capture] --> B[Brief]
  B --> D{Human decision}
  D -->|accept| T[Tasks / Calendar]
  D -->|dismiss| B
  T --> R[Weekly review]
  R --> B
```

The whole product exists to protect that **decision** box.

## How it is put together

```mermaid
flowchart LR
  SPA["React SPA<br/>repository root"] -->|Bearer token| API["Rust / Axum API<br/>backend/"]
  API --> PG[(Postgres<br/>+ pgvector)]
  API --> LLM[Claude]
  API --> G[Google Calendar / Gmail]
  API --> DD[daily.dev]
```

- **SPA:** React 18, TypeScript, Vite, TanStack Query, Zod at the network boundary.
- **API:** Rust, Axum, sqlx, Postgres/pgvector.
- **Auth:** Firebase ID tokens in production; the literal dev token locally when
  no identity provider is configured.
- **No secrets in the SPA.** The browser only holds the API URL and the auth
  provider's public config.

## Current state

The **API boundary is complete**: every current backend route has a typed client
module, Zod wire contract, timeout/401/429/503 handling, query keys, and MSW
tests.

The first product slice is live:

- `/` — public landing page with the real capability story.
- `/login` — sign-in and create-account flow. Firebase mode uses Google or
  email/password; local dev-token mode uses an explicit local session.
- `/brief` — the signed-in workspace: real open tasks, a real daily brief when
  one can be composed, and a compact ledger for adding/completing tasks.
- `/status` — diagnostics only, kept out of the product flow.

The remaining surfaces in [`FRONTEND.md`](FRONTEND.md) — prep, inbox, calendar,
review, knowledge, settings, onboarding — are the next build phase.

The landing footer includes a **replay intro** control. The intro is also shown
on first load.

## Setup

### Requirements

- **Node.js 22+** (the repo is developed on Node 26)
- **pnpm 12.4.1**, pinned in `package.json`. Install it globally with npm —
  Corepack is no longer bundled with Node 25+.
- **Rust 1.85+** (the backend is edition 2021)
- **Postgres 15+ with pgvector**, or a Supabase Postgres project, for persistence
- Optional: Anthropic API key, Firebase project, Google OAuth client, daily.dev
  token, embeddings key

### 1. Backend

From the repository root:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`. The minimum for the full local product is:

```dotenv
GROWTH_DATABASE_URL=postgresql://user:pass@host:5432/db
GROWTH_ANTHROPIC_API_KEY=sk-ant-...
GROWTH_CORS_ORIGINS=http://localhost:5173
```

For **local dev-token auth**, leave the identity provider blank:

```dotenv
GROWTH_FIREBASE_PROJECT_ID=
GROWTH_SUPABASE_URL=
```

> **Important:** the example file contains the placeholder
> `GROWTH_FIREBASE_PROJECT_ID=<your-firebase-project-id>`. That placeholder is a
> non-empty value, so the backend treats it as configured and stops accepting
> `Bearer dev`. Delete the line or leave it empty for local dev-token mode.

Create the schema once. Run these from `backend/` so the migration tool can read
`backend/.env`:

```bash
# Fresh database:
cargo run --bin apply_migration -- migrations/0007_consolidated_baseline.sql

# Existing pre-priority database only:
# cargo run --bin apply_migration -- migrations/0009_priority_classes.sql
```

`0008_drop_spa_legacy.sql` is an optional **destructive** cleanup for old
deployments. Do not run it on a fresh database.

Start the API:

```bash
cargo run
# → http://localhost:8000
```

Check it:

```bash
curl -s http://localhost:8000/healthz
```

You want `"database":"configured"`, `"anthropic":"configured"`, and
`"auth_mode":"dev"` for local dev-token mode.

### 2. Frontend

From the repository root:

```bash
npm install -g pnpm@12.4.1
pnpm install
cp .env.example .env.local
pnpm dev
# → http://localhost:5173
```

The default `.env.local` uses dev-token auth:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_AUTH_MODE=dev
VITE_DEV_TOKEN=dev
```

Open `http://localhost:5173`. The intro can be skipped with `Esc`, `Enter`,
`Space`, or the **Skip intro** button. It lifts onto the public landing page.

Use **Get started** or **Sign in** to reach `/login`. In dev-token mode, choose
**Enter local workspace**; the session is stored locally and takes you to
`/brief`. With Firebase configured, the same screen offers Google and
email/password sign-in or account creation.

### Auth modes

| Mode | Backend | Frontend |
|---|---|---|
| **Local dev token** | No Firebase/Supabase configured. `Bearer dev` maps to `local_dev`. | `VITE_AUTH_MODE=dev` |
| **Firebase** | `GROWTH_FIREBASE_PROJECT_ID` set to a real project ID. | `VITE_AUTH_MODE=firebase` plus all `VITE_FIREBASE_*` values. |

Do not mix them. If the backend has a Firebase project configured, a `dev`
bearer token will be rejected with `401`.

For Firebase: create a web app in the Firebase console, enable the sign-in
providers you want, add `localhost` as an authorized domain, then copy the web
config into `.env.local`:

```dotenv
VITE_AUTH_MODE=firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Optional integrations

| Feature | Backend values |
|---|---|
| Brief, capture, triage | `GROWTH_ANTHROPIC_API_KEY` |
| Google Calendar / Gmail | `GROWTH_GOOGLE_CLIENT_ID`, `GROWTH_GOOGLE_CLIENT_SECRET`, `GROWTH_GOOGLE_REDIRECT_URL`, valid 32-byte `GROWTH_TOKEN_ENC_KEY` |
| daily.dev feed | `GROWTH_DAILY_DEV_TOKEN` |
| Principle search / ingest | `GROWTH_EMBEDDINGS_API_KEY` |
| Scheduled briefs/reviews | `GROWTH_CRON_SECRET` |

Generate the token-encryption key with:

```bash
openssl rand -hex 32
```

The callback URL registered in Google Cloud must match:

```text
http://localhost:8000/api/integrations/google/callback
```

Calendar, Gmail, and RAG endpoints intentionally return `503` when their
configuration is absent. The rest of the app continues to work.

## Verify

```bash
# API health
curl -s http://localhost:8000/healthz

# Authenticated read in dev-token mode
curl -s -H 'Authorization: Bearer dev' \
  'http://localhost:8000/api/tasks?status=open'

# SPA checks
pnpm typecheck
pnpm test
pnpm build
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | Type-check + production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest wire-contract, client, and endpoint tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm preview` | Preview the production build |

## Repo map

```text
.
├── src/
│   ├── App.tsx                 # routes, public/auth guards, intro
│   ├── components/
│   │   ├── Intro.tsx           # first-load MrT title sequence
│   │   └── Wordmark.tsx        # MrT lockup with the crimson T
│   ├── lib/
│   │   ├── api/                # apiFetch, Zod schemas, endpoint modules
│   │   ├── auth/               # Firebase provider + session context
│   │   └── query/              # TanStack Query client + cache keys
│   ├── screens/
│   │   ├── LandingScreen.tsx   # public page
│   │   ├── LoginScreen.tsx     # sign in / create account
│   │   ├── BriefScreen.tsx     # signed-in daily brief + ledger
│   │   ├── StatusScreen.tsx    # diagnostics only
│   │   └── NotFoundScreen.tsx
│   ├── styles/                 # tokens, base, landing, login, workspace
│   └── tests/                  # MSW client tests + wire fixtures
├── backend/                    # Rust/Axum API + migrations
├── asset/                      # design reference and screen.png
├── docs/API_CONTRACT.md        # verified endpoints, drift, deferred gaps
├── FRONTEND.md                 # full visual/product build spec
└── .env.example                # SPA environment template
```

## The intro

The first-load sequence is deliberately short and skippable. `Mr` rises in ink,
the `T` lands as a crimson monolith, and a rule draws beneath it with the product
rule: **propose → decide → move**. It uses transform/opacity only, honours
`prefers-reduced-motion`, and never blocks the app's data fetching underneath.
The landing footer has **Replay intro** for another look.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401` on every `/api` call with `Bearer dev` | Backend has Firebase or Supabase configured. Blank `GROWTH_FIREBASE_PROJECT_ID` and `GROWTH_SUPABASE_URL`, then restart. |
| `503` on tasks | `GROWTH_DATABASE_URL` is missing or the database is unreachable. Set it, then apply the baseline migration. |
| `503` on Google/Gmail/calendar | Missing Google client values or an invalid `GROWTH_TOKEN_ENC_KEY`. The key must be 64 hex characters (32 bytes). |
| Calendar/Gmail consent returns to the wrong place | `GROWTH_GOOGLE_REDIRECT_URL` must match the Google Cloud authorized redirect exactly. |
| Browser CORS error | Add the SPA origin to `GROWTH_CORS_ORIGINS` (default `http://localhost:5173`). |
| `ERR_PNPM_IGNORED_BUILDS` on install | Run `pnpm approve-builds --all` once. The repo already lists allowed builds in `pnpm-workspace.yaml`. |
| Vite port busy | The dev server is pinned to `5173`; free it or update the port and backend CORS origin. |

## Product rule

**MrT proposes; the human decides.** Capture and triage return proposals only.
Nothing reaches the task pool without an explicit accept. The API contract and
client both protect that invariant — see
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).
