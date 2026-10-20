# Growth Copilot: Technical Architecture (Rust Edition)

> ⚠️ **2026-10-20:** this phase's report predates two user-directed changes:
> (1) the SPA frontend was **deleted** — the repo is backend-only; and (2) the
> Eisenhower quadrant model was **retired** — `tasks.priority` is now a single
> axis (`now` / `schedule` / `delegate` / `drop`, migration `0009`), see
> [../PURPOSE.md](../PURPOSE.md). Read the terminology here as history.
> System design and technical architecture.
> Companion docs: [FEATURES.md](./FEATURES.md) · [RAG_PIPELINE.md](./RAG_PIPELINE.md)

## Stack

| Layer | Technology |
|---|---|
| Frontend | React SPA (React 18, Vite, Tailwind 3) |
| Backend | **Rust, Axum** |
| Database | Supabase Postgres (+ pgvector) |
| LLM | Anthropic Claude |
| External data | daily.dev Public API |
| Integrations | Google Workspace APIs (Calendar, Gmail) |

**Language rationale.** The pivot from Python/FastAPI to Rust is driven by three non-negotiables:

1. **Memory safety without a garbage collector.** The borrow checker eliminates entire classes of bugs (use-after-free, data races) at compile time.
2. **Compile-time correctness.** SQLx validates queries against a live database at build time, and Rig validates tool schemas at compile time.
3. **Zero-cost abstractions.** Performance comparable to C while retaining high-level ergonomics.

---

## 1. High-Level Architecture

```
                      ┌─────────────────────────────────────────────┐
   Browser            │            CLOUDFLARE (static host)         │
   React 18 + Vite ──▶│  SPA assets (dist/), unchanged deploy path  │
   (Tailwind 3) ◀─────└───────────────────┬─────────────────────────┘
                          REST, JSON,     │ CORS-restricted
                          JWT (Firebase   ▼
                          ID token)   ┌─────────────────────────────────────┐
                                      │        AXUM BACKEND (Rust)          │
                                      │  /src/                              │
                                      │  ├─ routes/                         │
                                      │  │   ├─ tasks.rs        CRUD        │
                                      │  │   ├─ capture.rs      NL → tasks  │
                                      │  │   ├─ briefing.rs     GET / refresh│
                                      │  │   ├─ leetcode.rs     patterns + attempts│
                                      │  │   ├─ knowledge.rs    books ingest, RAG│
                                      │  │   ├─ calendar.rs     Google sync │
                                      │  │   ├─ email.rs        Gmail triage│
                                      │  │   ├─ integrations.rs OAuth mgmt  │
                                      │  │   └─ cron.rs         /cron/briefing│
                                      │  ├─ core/       config, db, auth, crypto│
                                      │  ├─ services/   anthropic, google,  │
                                      │  │              dailydev, rag, briefing│
                                      │  ├─ models/     sqlx FromRow        │
                                      │  └─ schemas/    serde DTOs          │
                                      └───────┬─────────┬──────┬────────────┘
                                              │         │      │
                     ┌────────────────────────▼─┐   ┌───▼──────▼──────────────┐
                     │ SUPABASE POSTGRES        │   │ ANTHROPIC Messages API  │
                     │ tasks + 6 domain tables  │   │ (tool use via Rig,      │
                     │ pgvector chunks (RAG)    │   │  structured JSON output)│
                     │ RLS policies             │   └─────────────────────────┘
                     └──────────────────────────┘
                                              │
                        ┌─────────────────────┼──────────────────────┐
                        ▼                     ▼                      ▼
                 daily.dev Public API   Google Calendar API      Gmail API
                 (Bearer, cached 24h)   (OAuth 2.0, encrypted    (read-only,
                                        tokens in `integrations`) v1 first)

                 Scheduler: cron → POST /cron/briefing (system crontab on the
                 Axum host, or GitHub Actions: one scheduled HTTP call per day)
```

### Why Rust and Axum (the pivot from Python/FastAPI)

| Concern | Rust + Axum | Python + FastAPI |
|---|---|---|
| Memory safety | Compile-time guarantees, no GC pauses | GC pauses, runtime refcounting |
| SQL correctness | SQLx compile-time query validation | Runtime-only validation |
| LLM tool safety | Rig's `Tool` trait enforces typed I/O at compile time | Pydantic at runtime |
| Performance | Actix ~75k req/s, Axum ~47–71k req/s | FastAPI ~3.6k req/s |
| Concurrency | `Send + Sync` enforced at compile time | GIL, runtime locks |

**Why Axum over Actix Web.** Axum is maintained by the Tokio team, integrates with Tower middleware (tracing, rate limiting, auth layers), and has a gentler learning curve with idiomatic extractors. The performance gap to Actix is small enough that it is rarely the bottleneck for CRUD and LLM orchestration workloads.

### Host Decision

The Axum container deploys on **Fly.io or Railway**, while Postgres stays in Supabase Cloud. CORS is locked to the SPA origin, and HTTPS is handled by the host's routing layer.

---

## 2. Backend Structure (Axum)

```
backend/
├── src/
│   ├── main.rs                  # Axum app, CORS, router mounting, state
│   ├── core/
│   │   ├── config.rs            # figment config (env-driven)
│   │   ├── db.rs                # sqlx PgPool
│   │   ├── auth.rs              # firebase-admin-rs ID token verification
│   │   └── crypto.rs            # AES-GCM token encryption (age/ring)
│   ├── routes/                  # one module per feature (see FEATURES.md)
│   ├── services/
│   │   ├── anthropic.rs         # Rig Agent wrappers, tool definitions
│   │   ├── dailydev.rs          # reqwest client + 24h cache table
│   │   ├── google_calendar.rs   # Calendar v3 client
│   │   ├── gmail.rs             # Gmail v1 read-only client
│   │   ├── rag.rs               # retrieval pipeline (see RAG_PIPELINE.md)
│   │   └── briefing.rs          # morning compose orchestration
│   ├── models/                  # sqlx FromRow structs (mirror migrations)
│   ├── schemas/                 # serde DTOs (request/response)
│   └── jobs/
│       └── morning_brief.rs     # scheduled callable
├── data/
│   └── books/                   # the 5 books, added later
├── migrations/                  # sqlx .sql migrations
├── tests/                       # integration tests (mock services)
├── Cargo.toml                   # deps, features
└── Dockerfile
```

### Core Dependencies (`Cargo.toml`)

```toml
[dependencies]
# Web framework
axum = { version = "0.8", features = ["macros"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace"] }
tokio = { version = "1", features = ["full"] }

# Database
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono", "json"] }

# LLM / RAG
rig-core = "0.6"                 # Anthropic, embeddings, RAG abstractions

# Auth
firebase-admin = "0.1"           # ID token verification, JWKS caching

# Crypto (Google refresh tokens)
aes-gcm = "0.10"
ring = "0.17"

# HTTP client
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Config
figment = { version = "0.10", features = ["env", "toml"] }

# Error handling
thiserror = "2"
anyhow = "1"

[dev-dependencies]
wiremock = "0.6"                 # mock HTTP services for tests
tokio-test = "0.4"
```

---

## 3. Data Model (Supabase Postgres)

The schema extends the existing `tasks` table and adds six new tables plus two RAG tables (full RAG schema in [RAG_PIPELINE.md](./RAG_PIPELINE.md)). All tables sit under RLS keyed by `user_id`.

### Extending `tasks`

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'done', 'archived'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);
```

### Integrations and Briefings

```sql
CREATE TABLE integrations (
  user_id           TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  access_token_enc  BYTEA NOT NULL,
  refresh_token_enc BYTEA NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  scopes            TEXT[] NOT NULL,
  connected_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_briefings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  brief_date  DATE NOT NULL,
  payload     JSONB NOT NULL,
  model       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, brief_date)
);

CREATE TABLE dailydev_cache (
  user_id     TEXT NOT NULL,
  feed        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, feed)
);
```

### LeetCode Tracking

```sql
CREATE TABLE leetcode_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  notes       TEXT,
  confidence  INT DEFAULT 1 CHECK (confidence BETWEEN 1 AND 5),
  next_review DATE,
  ease        REAL DEFAULT 2.5,
  UNIQUE (user_id, name)
);

CREATE TABLE leetcode_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  problem_url     TEXT NOT NULL,
  problem_title   TEXT,
  difficulty      TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  pattern_id      UUID REFERENCES leetcode_patterns(id),
  time_taken_min  INT,
  needed_help     BOOLEAN DEFAULT false,
  notes           TEXT,
  attempted_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Knowledge (Books) and Email

```sql
CREATE TABLE knowledge_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book            TEXT NOT NULL,
  chapter         TEXT,
  idea            TEXT NOT NULL,
  tags            TEXT[] DEFAULT '{}',
  weight          REAL DEFAULT 1.0,
  accepted_count  INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_triage (
  gmail_msg_id      TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  category          TEXT CHECK (category IN ('reply', 'fyi', 'task', 'ignore')),
  summary           TEXT,
  suggested_task_id UUID REFERENCES tasks(id),
  triaged_at        TIMESTAMPTZ DEFAULT NOW()
);
```

### SQLx Model Example

```rust
use sqlx::FromRow;
use chrono::{DateTime, Utc};

#[derive(Debug, FromRow)]
pub struct Task {
    pub id: uuid::Uuid,
    pub user_id: String,
    pub title: String,
    pub status: String,
    pub due_date: Option<chrono::NaiveDate>,
    pub completed_at: Option<DateTime<Utc>>,
    pub source: String,
    pub meta: serde_json::Value,
    pub tags: Vec<String>,
}
```

Compile-time query validation:

```rust
let tasks: Vec<Task> = sqlx::query_as!(
    Task,
    r#"SELECT id, user_id, title, status, due_date, completed_at, source, meta, tags
       FROM tasks WHERE user_id = $1 AND status = 'open'"#,
    user_id
)
.fetch_all(&pool)
.await?;
```

If a column name is misspelled or a type doesn't match, **the code won't compile**.

---

## 4. API Surface

**Authentication.** Every route requires `Authorization: Bearer <Firebase ID token>`. Tokens are verified with `firebase-admin-rs` against Firebase public keys, with JWKS caching.

| Route | Method | Purpose |
|---|---|---|
| `/api/tasks` | GET, POST, PATCH, DELETE | Existing CRUD |
| `/api/capture` | POST | `{text}` → Claude tool use → tasks |
| `/api/briefing` | GET | Today's brief |
| `/api/briefing/refresh` | POST | Force re-compose |
| `/api/briefing/accept` | POST | Accept a proposed item → task |
| `/api/leetcode/patterns` | GET, POST, PATCH | Pattern library |
| `/api/leetcode/attempts` | GET, POST | Log attempt and update spaced repetition |
| `/api/knowledge/items` | GET | Principles list and weights |
| `/api/knowledge/ingest` | POST | Re-run books ingestion |
| `/api/calendar/sync` | POST | Pull 7 days of events |
| `/api/calendar/plan` | GET | Scheduling suggestions |
| `/api/email/triage` | POST | Classify unread mail |
| `/api/email/triage/{id}/act` | POST | Mark done or convert to task |
| `/api/integrations/google/url` | GET | OAuth consent redirect |
| `/api/integrations/google/callback` | GET | Token exchange |
| `/cron/briefing` | POST | Cron caller (secret-guarded) |

### LLM Integration with Rig

Rig provides a unified interface across providers, and Claude is a first-class citizen:

```rust
use rig::providers::anthropic;
use rig::agent::Agent;
use rig::tool::Tool;

// Provider client
let client = anthropic::Client::new(&api_key);

// Tool for task creation
#[derive(Deserialize)]
struct CreateTaskArgs {
    title: String,
    due_date: Option<String>,
}

struct CreateTaskTool { pool: sqlx::PgPool }

impl Tool for CreateTaskTool {
    const NAME: &'static str = "create_task";
    type Error = anyhow::Error;
    type Args = CreateTaskArgs;
    type Output = String;

    async fn definition(&self, _prompt: String) -> rig::tool::ToolDefinition {
        rig::tool::ToolDefinition {
            name: "create_task".to_string(),
            description: "Create a new task for the user".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "due_date": { "type": "string", "format": "date" }
                },
                "required": ["title"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let task = sqlx::query_as!(
            Task,
            "INSERT INTO tasks (user_id, title, due_date) VALUES ($1, $2, $3) RETURNING *",
            "user_id_placeholder", args.title, args.due_date
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(format!("Created task: {}", task.title))
    }
}

// Agent with tools
let agent = client.agent("claude-sonnet-4-20250514")
    .preamble("You are a task capture assistant. Use tools to create tasks.")
    .tool(CreateTaskTool { pool: pool.clone() })
    .build();

let response = agent.prompt("Remind me to review PRs tomorrow").await?;
```

Rig handles the tool-calling loop automatically. The model's output is bound to validated schemas and is never parsed from free-form prose.

### Prompt Assembly (Briefing and Capture)

1. **Grounding:** open tasks, calendar load, overdue list
2. **Retrieval:** top-k semantically relevant `knowledge_items` via RAG
3. **Scheduling pressure:** LeetCode spaced-repetition due list, streak state

---

## 5. Security

| Concern | Measure |
|---|---|
| API auth | `firebase-admin-rs` ID token verification server-side, JWKS caching, no secrets in the SPA |
| Google OAuth | Authorization-code flow; refresh tokens AES-GCM encrypted (key in env), never logged |
| Gmail privacy | Metadata and snippets by default; full body only on explicit open; read-only scope |
| daily.dev token | Server-side only; one fetch per user per day via cache table |
| Cron endpoint | Guarded by shared-secret header |
| SQL | SQLx parameterized queries with compile-time validation; Supabase RLS enforced |
| Secrets | `.env` on host or platform secrets, never committed |
| Memory safety | Rust's ownership model eliminates use-after-free, data races, and buffer overflows at compile time |

---

## 6. RAG Pipeline with pgvector

The RAG pipeline uses Supabase's pgvector extension for similarity search. At production scale (hundreds of thousands of chunks), pgvector with HNSW indexing gives near-constant-latency vector search. Full pipeline design lives in [RAG_PIPELINE.md](./RAG_PIPELINE.md).

### Vector Store Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_item_id  UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
    content            TEXT NOT NULL,
    embedding          vector(1536),        -- OpenAI embeddings (Anthropic does not serve embeddings)
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### Hybrid Search (BM25 + Vector)

Combining semantic search with keyword matching improves retrieval quality. BM25 scoring is pushed into PostgreSQL for performance:

```sql
-- Hybrid search: combine vector similarity and BM25
WITH vector_results AS (
    SELECT id, 1 - (embedding <=> $1) AS similarity
    FROM knowledge_chunks
    ORDER BY embedding <=> $1
    LIMIT $2
),
bm25_results AS (
    SELECT chunk_id, bm25_score
    FROM chunk_terms
    WHERE term = ANY($3)
    GROUP BY chunk_id
),
-- Reciprocal Rank Fusion
combined AS (
    SELECT id, (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY similarity DESC))) AS rrf_score
    FROM vector_results
    UNION ALL
    SELECT chunk_id AS id, (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY bm25_score DESC))) AS rrf_score
    FROM bm25_results
)
SELECT kc.content, SUM(c.rrf_score) AS score
FROM combined c
JOIN knowledge_chunks kc ON kc.id = c.id
GROUP BY kc.id, kc.content
ORDER BY score DESC
LIMIT $4;
```

**Embedded alternative.** For smaller scale, LanceDB (via the `lancedb` crate) works with the same chunking strategy. Switch to pgvector once the corpus exceeds roughly 50k chunks.

---

## 7. Build Phases (Rust Track)

| Phase | Scope |
|---|---|
| **0** | Scaffold `backend/`: Axum, SQLx, `firebase-admin-rs`; migrations; `/api/tasks` CRUD |
| **1** | Capture, briefing, and daily.dev client (Anthropic via Rig) |
| **2** | LeetCode module and books RAG ingestion (embedding provider + pgvector) |
| **3** | Google Calendar OAuth, sync, and gap suggestions |
| **4** | Gmail triage |
| **5** | Weekly review and analytics |
| **6** | Multi-user support and onboarding |

**Current step: Phase 0.** Scaffold the backend without changing existing SPA behavior until `/api/tasks` passes parity tests against direct-Supabase mode.

---

## 8. Key Library Rationale

| Need | Rust choice | Why |
|---|---|---|
| Web framework | **Axum** | Tower middleware, Tokio team, gentle learning curve, type-safe extractors |
| Database | **SQLx** | Compile-time query validation, async, thin abstraction, explicit SQL |
| LLM orchestration | **Rig** | Unified Anthropic/OpenAI/Gemini interface, typed tools, RAG and agent abstractions |
| Auth | **firebase-admin-rs** | ID token verification with JWKS caching, emulator support |
| Vector store | **pgvector** via SQLx | One database for relational and vector data, HNSW indexing for scale |
| Encryption | **aes-gcm + ring** | Rust-native, memory-safe crypto for OAuth tokens |
| HTTP client | **reqwest** | Async, rustls, connection pooling for Google and daily.dev APIs |
| Config | **figment** | Env and TOML composition, typed settings |
| Testing | **wiremock** | Mock external APIs without network dependencies |

---

The result is a backend that is **memory-safe by construction**, **validated at compile time where it matters most** (SQL and tool schemas), and **free of the boilerplate that typically accompanies Rust web development**, thanks to Axum's extractors, SQLx's `FromRow` derive, and Rig's `Tool` trait.
