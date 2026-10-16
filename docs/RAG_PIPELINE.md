# Growth Copilot — RAG Pipeline Design

> How retrieval-augmented generation powers the Principles Engine, briefing, capture, and later daily.dev/inbox context. Rust/Axum edition.
> Companion docs: [FEATURES.md](./FEATURES.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

## 1. Why RAG here

The AI features need to sound like **you** and reason with **your materials** —
five books' worth of principles, your LeetCode patterns, article context — inside a
prompt that also carries tasks and calendar. RAG keeps the prompt small (top-k
*relevant* content only), grounds every suggestion in a source, and lets the
knowledge pool grow (books → saved articles → inbox themes) without prompt bloat.

## 2. Sources of truth (ingestion inputs)

| Source | Format | Content |
|---|---|---|
| **Books (5)** | JSON/Markdown in `backend/data/books/` | Distilled principles: idea, application, chapter, tags |
| **User corrections** | runtime | Capture re-triage edits that disagree with Claude's suggestion → become correction chunks |
| daily.dev articles | API (+ `dailydev_cache`) | Summaries of "deep-dive tasks" you saved |
| Own notes (later) | future | Anything else you want the AI to reason over |

## 3. Pipeline stages (Rust implementation)

```
 STAGE A — INGESTION                 STAGE B — STORAGE            STAGE C — RETRIEVAL
 ─────────────────────               ─────────────────            ─────────────────────
 services/rag.rs ingest()            Supabase pgvector            services/rag.rs retrieve()
       │                                   │                              │
 load backend/data/books/*.json      knowledge_chunks (see §4)     build query from context
       │                                   │                              │
 parse/chunk (idea ≈ one chunk,      upsert (content-hash keyed,          │
 250–400 tokens, never split          re-ingest is idempotent)            │
 mid-idea) via services/rag.rs                    │                      embed query (same model)
       │                                          │                              │
 enrich: store idea +                HNSW index on embedding                │
 "application hint" fields                 + chunk_terms (BM25 side         │
       │                                    table for hybrid search)        │
 embed via embeddings API  ────────▶  pgvector + 50k+ scale safety   ──▶ top-k = cosine (HNSW)
                                     (LanceDB below 50k chunks    + BM25 term match, fused
                                      if/when needed per ARCH §6)   via Reciprocal Rank Fusion
                                                                                   │
                                                                     MMR λ≈0.7 near-dupe trim
                                                                                   │
                                                                     inject top-k as prompt
                                                                     "Principles to consider"
```

**Ingestion trigger:** `POST /api/knowledge/ingest` — reads the books JSON,
chunks, embeds in batches, upserts chunks; runs as a `tokio` task so the HTTP
call stays fast. Re-run safe (dedup by `content_hash` in `meta`).

## 4. Vector storage (canonical schema)

The schema below is the source of truth (mirrors ARCHITECTURE §6):

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_item_id  UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
    content            TEXT NOT NULL,
    content_hash       TEXT NOT NULL,             -- idempotent re-ingestion
    meta               JSONB NOT NULL DEFAULT '{}', -- tags, chapter, weight, source
    embedding          vector(1536),
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

Distinct books/principles live in **`knowledge_items`** (relational, listable,
weightable); `knowledge_chunks` holds the retrieval units. A one-idea-per-book-chunk
corpus will often be 1:1 (item ↔ chunk); longer sources fan out 1:N.

**Retrieval backends.** pgvector (SQLx-accessible, same DB as everything else)
is the default. The `lancedb` crate is the documented alternative below ~50k
chunks; both consume the same chunker, so switching is an ingest re-run.

## 5. Embedding provider (decision)

Anthropic does **not** offer an embeddings API — Claude reasons, it does not
embed. Rig's unified embedding interface makes the provider a config choice:

| Option | Verdict |
|---|---|
| **OpenAI `text-embedding-3-small`** | ✅ default: 1536-dim, cheap, universally supported |
| Voyage AI (`voyage-3`) | Strong quality, Anthropic's recommended embedding partner |
| Local model later | Zero API cost; swap config → re-embed once |

Figment config (env or `config.toml`), 1536-dim pinned in the schema above:

```toml
[embeddings]
provider = "openai"          # embeddings.base_url swappable per Rig cfg
model = "text-embedding-3-small"
dim = 1536
```

Same model and dim for documents **and** queries — mismatch invalidates retrieval.

## 6. Retrieval flows (where RAG fires)

| # | Flow | Query built from | Uses |
|---|---|---|---|
| R1 | **Morning briefing** principles nudge | today's top tasks + calendar themes | top 3 principles |
| R2 | **NL capture** | captured text | top 2 — nudge quadrant choice when ambiguous |
| R3 | **LeetCode drill** | pattern name + last-attempt notes | explain-the-"why" recap for scheduled reviews |
| R4 | **Gmail triage** | message snippet + task context + user reply patterns | decision rules for Reply/FYI/Task/Ignore |
| R5 | **Weekly review** | weeks' accepted/rejected brief items | which principles are earning relevance (feeds §7) |

### Retrieval procedure (services/rag.rs)

1. **Build query:** concatenate the flow's context (task titles, event titles,
   snippet, or last notes).
2. **Hybrid search:** the RRF SQL from [ARCHITECTURE §6](./ARCHITECTURE.md) —
   cosine over HNSW **fused with BM25** term scores; keyword ("sliding window",
   "deep work") competes fairly with semantics this way.
3. **Diversity trim:** MMR (λ≈0.7) to drop near-duplicate chunks.
4. **Inject into the prompt** as a clearly-labeled section:

```text
## Principles to consider (retrieved context — optionally cite)
- "Two-minute rule: if it takes fewer than 2 minutes, do it now;
   anything else goes to the correct quadrant."   («Getting Things Done», ch.7)
- "Amateurs sit and wait for inspiration; the rest of us just get
   up and go to work."   («The War of Art», ch.2)
… (retrieved for today's task mix; do not force any principle into
   the reply if nothing naturally matches)
```

5. **Log surfaced chunk ids** against the operation (§7) — retrieval provenance
   is a debug route, never exposed to users.

## 7. Feedback loop (what makes it *yours*)

- Every briefing/capture action the user **accepts** increments
  `accepted_count` on the referenced `knowledge_items`
- Prompt-time weighting derives from live data, not static values:

```text
final_weight = base_weight * log(1 + accepted_count) / (1 + conflicts)
```

- Phase 5 weekly job re-ranks principles and **deprioritizes** (never deletes)
  those that drift out of contextual usefulness — quarantine, not deletion.

This is what separates a copilot grounded in your data from a nudging chatbot:
over a year it converges to *your* two-minute rule, *your* deep-work cadence,
*your* interview-prep habits.

## 8. Testing & evaluation

| Test | Method |
|---|---|
| Retrieval relevance | Golden set: 20 known principles + their expected queries; assert each source appears in top-3 (RF score or plain cosine) |
| Chunking integrity | Unit test: no chunk > 400 tokens, ideas never split |
| Ingestion idempotence | Re-run the same books JSON → row count unchanged (content_hash dedup) |
| Hybrid fusion | wiremock-served embedding responses + seeded `chunk_terms`; assert RRF ordering |
| End-to-end capture | Rig mock agent; capture text → tasks created + prompt log shows retrieved principles |
| Hybrid search latency | Bench query on seeded (<50k) corpus; assert pgvector HNSW latency budget holds |

## 9. Rollout within phases (Rust track)

| Phase | RAG milestone |
|---|---|
| 0 | `knowledge_items` + `knowledge_chunks` migrations land with Phase 0 schema (empty until Phase 2) |
| 1 | Embedding provider picked; chunker + ingester build with real books JSON smoke test |
| 2 | **RAG go-live:** hybrid retrieval wired into capture (R2) + briefing (R1); feedback counters live |
| 3–4 | R3 (LeetCode) + R4 (Gmail) flows join the retrieval surface |
| 5 | Weekly re-weighting job; golden-set evals added to CI |
