-- ============================================================================
-- 0007 — CONSOLIDATED BASELINE (Phase 6 §7)
-- ============================================================================
-- The canonical schema of the Growth Copilot backend, in one file. Replaces
-- the incremental 0001–0006 migrations (archived under migrations/archive/);
-- a fresh database reaches the exact production shape with this file alone.
-- Every statement is idempotent, so running it against an already-migrated
-- database is a no-op.
--
-- What is NOT here:
--   * The six pre-backend SPA tables (`monthly_reports`, `motivation_quotes`,
--     `task_completions`, `task_trash`, `user_notifications`,
--     `user_streaks`). They were created outside this project, no live
--     trigger or edge function still reads them (verified 2026-10-19:
--     information_schema.triggers is empty), and the backend does not own
--     them. Per the recorded decision (2026-10-19) they are dropped by the
--     separate file `0008_drop_spa_legacy.sql` — deliberately kept apart so
--     the destructive act is an explicit, reviewable step.
--   * `auth.*`, `storage.*`, `realtime.*` — Supabase-managed, untouched.
--
-- Data-reset note: streaks/reports data is DERIVABLE — `user_streaks` can be
-- recomputed from `tasks.completed_at` history; `motivation_quotes` (10 rows)
-- can be reseeded as knowledge items if wanted. No irreversible content lives
-- in the dropped tables.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. tasks — the matrix (the SPA's original base table, now owned canonically)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  quadrant    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'open',
  due_date    DATE,
  completed_at TIMESTAMPTZ,
  source      TEXT NOT NULL DEFAULT 'user',
  meta        JSONB NOT NULL DEFAULT '{}',
  tags        TEXT[] DEFAULT '{}',
  CONSTRAINT tasks_quadrant_check CHECK (quadrant = ANY (ARRAY[
      'urgent_important','urgent_not_important','not_urgent_important','not_urgent_not_important'])),
  CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['open','done','archived']))
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);

-- ============================================================================
-- 2. integrations — OAuth tokens at rest (AES-GCM), one row per provider
-- ============================================================================
CREATE TABLE IF NOT EXISTS integrations (
  user_id           TEXT NOT NULL,
  provider          TEXT NOT NULL,
  access_token_enc  BYTEA NOT NULL,
  refresh_token_enc BYTEA NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  scopes            TEXT[] NOT NULL,
  connected_at      TIMESTAMPTZ DEFAULT NOW()
);
-- (re-keyed in 0003: exactly one token snapshot per (user, provider))
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_pkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'integrations'::regclass AND contype = 'p'
      AND pg_get_constraintdef(oid) LIKE '%user_id%provider%'
  ) THEN
    ALTER TABLE integrations ADD PRIMARY KEY (user_id, provider);
  END IF;
END $$;

-- ============================================================================
-- 3. daily_briefings — composed morning briefs (compose-or-reuse cache)
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_briefings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  brief_date DATE NOT NULL,
  payload    JSONB NOT NULL,
  model      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT daily_briefings_user_date UNIQUE (user_id, brief_date)
);

-- ============================================================================
-- 4. dailydev_cache — daily.dev Public API responses behind a 24h TTL
-- ============================================================================
CREATE TABLE IF NOT EXISTS dailydev_cache (
  user_id    TEXT NOT NULL,
  feed       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT dailydev_cache_user_feed PRIMARY KEY (user_id, feed)
);

-- ============================================================================
-- 5. LeetCode — spaced-repetition patterns (SM-2-lite) + raw attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS leetcode_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  notes       TEXT,
  confidence  INT DEFAULT 1,
  next_review DATE,
  ease        REAL DEFAULT 2.5,
  meta        JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_patterns_user_due
  ON leetcode_patterns (user_id, next_review);

CREATE TABLE IF NOT EXISTS leetcode_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  problem_url     TEXT NOT NULL,
  problem_title   TEXT,
  difficulty      TEXT,
  pattern_id      UUID,
  time_taken_min  INT,
  needed_help     BOOLEAN DEFAULT false,
  notes           TEXT,
  attempted_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attempts_user_at
  ON leetcode_attempts (user_id, attempted_at DESC);

-- ============================================================================
-- 6. email_triage — Gmail-metadata-only triage proposals (idempotent per msg)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_triage (
  gmail_msg_id     TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  category         TEXT,
  summary          TEXT,
  suggested_task_id UUID,
  triaged_at       TIMESTAMPTZ DEFAULT NOW(),
  subject          TEXT,
  state            TEXT NOT NULL DEFAULT 'open',
  CONSTRAINT email_triage_user_msg UNIQUE (user_id, gmail_msg_id)
);
CREATE INDEX IF NOT EXISTS idx_email_triage_user_state
  ON email_triage (user_id, state);

-- ============================================================================
-- 7. calendar_events — Google Calendar MIRROR (never rows in tasks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  event_id   TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  busy       BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT calendar_events_user_event UNIQUE (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_user_start
  ON calendar_events (user_id, start_at);

-- ============================================================================
-- 8. knowledge — books corpus, hybrid-retrieval chunks, provenance, feedback
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book            TEXT NOT NULL,
  chapter         TEXT,
  idea            TEXT NOT NULL,
  tags            TEXT[] DEFAULT '{}',
  weight          REAL DEFAULT 1.0,
  accepted_count  INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  user_id         TEXT NOT NULL,
  conflicts       INT NOT NULL DEFAULT 0,
  -- RAG §7 output column, written only by the re-weighting job:
  --   effective = base × (1 + ln(1 + accepted)) / (1 + conflicts)
  -- quarantine = 0.1 (deprioritized, never deleted); ≤ 0.15 stops surfacing
  effective_weight REAL NOT NULL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_items_user ON knowledge_items (user_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_item_id UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL,
  content           TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  meta              JSONB NOT NULL DEFAULT '{}',
  lex               TSVECTOR,          -- generated from content at write time
  embedding         VECTOR(1536)       -- default provider dim; see GROWTH_EMBEDDINGS_DIM
);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_lex ON knowledge_chunks USING gin (lex);
CREATE INDEX IF NOT EXISTS idx_chunks_user_item
  ON knowledge_chunks (user_id, knowledge_item_id);
-- one idea = one chunk (Phase 2 decision; MMR deferred)
CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_item ON knowledge_chunks (knowledge_item_id);

CREATE TABLE IF NOT EXISTS knowledge_surface_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,       -- brief | capture | email
  surfaced_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_surface_user_item
  ON knowledge_surface_log (user_id, knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_surface_time ON knowledge_surface_log (surfaced_at DESC);

-- ============================================================================
-- 9. weekly_reviews — Saturday brief variant (upserted per user/week)
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  week_start DATE NOT NULL,           -- ISO Monday of the reviewed week
  payload    JSONB NOT NULL,
  model      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT weekly_reviews_user_week UNIQUE (user_id, week_start)
);

-- ============================================================================
-- 10. user_profiles — onboarding + prompt assembly (Phase 6 §2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id               TEXT PRIMARY KEY,
  name                  TEXT,
  target_interview_date DATE,
  focus_areas           TEXT[] NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. RLS — every per-user table follows the backend's identity contract:
--     `user_id = current_setting('app.current_user_id', true)`.
--     The backend is the enforcement layer today (verified uid bound into
--     every query); RLS is the parallel constraint for any future direct
--     PostgREST path. The six legacy SPA tables (auth.uid() convention) are
--     dropped by 0008, not folded in.
-- ============================================================================
DO $$
DECLARE
    t TEXT;
    act TEXT;
    pol TEXT;
    tables TEXT[] := ARRAY['tasks','integrations','daily_briefings','dailydev_cache',
                            'leetcode_patterns','leetcode_attempts','email_triage',
                            'calendar_events','knowledge_items','knowledge_chunks',
                            'knowledge_surface_log','weekly_reviews','user_profiles'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        FOREACH act IN ARRAY ARRAY['select','insert','update','delete'] LOOP
            pol := t || '_' || act;
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = t AND policyname = pol
            ) THEN
                EXECUTE format(
                    'CREATE POLICY %I ON %I FOR %s %s (user_id = current_setting(''app.current_user_id'', true))',
                    pol, t, upper(act),
                    CASE WHEN act = 'insert' THEN 'WITH CHECK' ELSE 'USING' END);
            END IF;
        END LOOP;
    END LOOP;
END $$;
