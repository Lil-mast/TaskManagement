-- Phase 2: RAG storage + retrieval plumbing (ARCHITECTURE §6 / RAG_PIPELINE §4)
-- Additive on top of 0001_phase0_schema.sql.
-- installable extension there ("extensions" → vector).

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Principles (books) — now per-user so corpora stay private ------------------
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'local_dev';

-- 2. Chunks + embeddings (one idea ≈ one chunk, idempotent re-ingest) ----------
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_item_id  UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL,
  content            TEXT NOT NULL,
  content_hash       TEXT NOT NULL,                    -- sha256 → idempotent upsert
  meta               JSONB NOT NULL DEFAULT '{}',      -- source_ref, tags, weight
  lex                tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding          vector(1536),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_chunks_lex ON knowledge_chunks
  USING gin (lex);
CREATE INDEX IF NOT EXISTS idx_chunks_user_item ON knowledge_chunks (user_id, knowledge_item_id);
-- one idea ≈ one chunk (for now) — lets ingest upsert on conflict
CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_item ON knowledge_chunks (knowledge_item_id);

-- 3. RLS: chunks and items per user -------------------------------------------
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'knowledge_chunks' AND policyname = 'knowledge_chunks_user_select'
    ) THEN
        CREATE POLICY knowledge_chunks_user_select ON knowledge_chunks
          FOR SELECT USING (user_id = current_setting('app.current_user_id', true));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'knowledge_chunks' AND policyname = 'knowledge_chunks_user_insert'
    ) THEN
        CREATE POLICY knowledge_chunks_user_insert ON knowledge_chunks
          FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));
    END IF;
END$$;

-- knowledge_items were global; scope them too once a user_id fills in
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'knowledge_items' LIMIT 1
    ) THEN RETURN; -- policies already present
    END IF;
    ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY knowledge_items_user_select ON knowledge_items
      FOR SELECT USING (user_id = current_setting('app.current_user_id', true)
                        OR user_id IS NULL);
    CREATE POLICY knowledge_items_user_insert ON knowledge_items
      FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));
    CREATE POLICY knowledge_items_user_update ON knowledge_items
      FOR UPDATE USING (user_id = current_setting('app.current_user_id', true));
    CREATE POLICY knowledge_items_user_delete ON knowledge_items
      FOR DELETE USING (user_id = current_setting('app.current_user_id', true));
END$$;

-- 4. leetcode_patterns needs meta for the spaced-repetition interval ----------
ALTER TABLE leetcode_patterns ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';

-- 5. accepted_count feedback (already on knowledge_items from 0001) ------------
--    No change needed; the counter semantics live in services/rag.rs.
