-- ============================================================================
-- 0010 — NEON FRESH START
-- ============================================================================
-- Complete schema migration for Neon PostgreSQL. Combines 0007 (baseline),
-- 0008 (drop legacy), and 0009 (priority classes) into one idempotent file.
-- 
-- Designed for fresh Neon database creation; safe to run on empty database.
-- Removes Supabase-specific RLS policies and adapts for self-hosted auth.
-- ============================================================================

-- Create required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. tasks — the copilot's task pool (priority: now | schedule | delegate | drop)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'open',
  due_date    DATE,
  completed_at TIMESTAMPTZ,
  source      TEXT NOT NULL DEFAULT 'user',
  meta        JSONB NOT NULL DEFAULT '{}',
  tags        TEXT[] DEFAULT '{}',
  CONSTRAINT tasks_priority_check CHECK (priority = ANY (ARRAY[
      'now','schedule','delegate','drop'])),
  CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['open','done','archived']))
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON tasks (user_id, created_at DESC);

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
  connected_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_expires ON integrations (expires_at);

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

CREATE INDEX IF NOT EXISTS idx_daily_briefings_user ON daily_briefings (user_id);

-- ============================================================================
-- 4. dailydev_cache — daily.dev Public API responses behind a 24h TTL
-- ============================================================================
CREATE TABLE IF NOT EXISTS dailydev_cache (
  user_id    TEXT NOT NULL,
  feed       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, feed)
);

CREATE INDEX IF NOT EXISTS idx_dailydev_cache_fetched ON dailydev_cache (fetched_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_patterns_user
  ON leetcode_patterns (user_id);

CREATE TABLE IF NOT EXISTS leetcode_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  problem_url     TEXT NOT NULL,
  problem_title   TEXT,
  difficulty      TEXT,
  pattern_id      UUID REFERENCES leetcode_patterns(id) ON DELETE SET NULL,
  time_taken_min  INT,
  needed_help     BOOLEAN DEFAULT false,
  notes           TEXT,
  attempted_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_at
  ON leetcode_attempts (user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_user
  ON leetcode_attempts (user_id);

-- ============================================================================
-- 6. email_triage — Gmail-metadata-only triage proposals (idempotent per msg)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_triage (
  gmail_msg_id     TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  category         TEXT,
  summary          TEXT,
  suggested_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  triaged_at       TIMESTAMPTZ DEFAULT NOW(),
  subject          TEXT,
  state            TEXT NOT NULL DEFAULT 'open',
  UNIQUE (user_id, gmail_msg_id),
  PRIMARY KEY (user_id, gmail_msg_id)
);

CREATE INDEX IF NOT EXISTS idx_email_triage_user_state
  ON email_triage (user_id, state);
CREATE INDEX IF NOT EXISTS idx_email_triage_user
  ON email_triage (user_id);

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
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_user_start
  ON calendar_events (user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_user
  ON calendar_events (user_id);

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
  effective_weight REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_items_user ON knowledge_items (user_id);
CREATE INDEX IF NOT EXISTS idx_items_created ON knowledge_items (created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL,
  content           TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  meta              JSONB NOT NULL DEFAULT '{}',
  lex               TSVECTOR,
  embedding         VECTOR(1536)
);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_lex ON knowledge_chunks USING gin (lex);
CREATE INDEX IF NOT EXISTS idx_chunks_user_item
  ON knowledge_chunks (user_id, knowledge_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_item ON knowledge_chunks (knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user
  ON knowledge_chunks (user_id);

CREATE TABLE IF NOT EXISTS knowledge_surface_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  surfaced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surface_user_item
  ON knowledge_surface_log (user_id, knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_surface_time ON knowledge_surface_log (surfaced_at DESC);
CREATE INDEX IF NOT EXISTS idx_surface_user ON knowledge_surface_log (user_id);

-- ============================================================================
-- 9. weekly_reviews — Saturday brief variant (upserted per user/week)
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  week_start DATE NOT NULL,
  payload    JSONB NOT NULL,
  model      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user ON weekly_reviews (user_id);

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
-- Migration: 0009 Priority Classes alignment (applied at creation)
-- ============================================================================
-- The priority column is created with the correct constraint.
-- No legacy quadrant data exists in a fresh database.

-- ============================================================================
-- Done: Schema is idempotent and ready for application
-- ============================================================================
