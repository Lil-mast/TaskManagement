-- Phase 0: schema from ARCHITECTURE §3
-- Additive; safe to run once against the live Supabase project.

-- 1. Extend tasks --------------------------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'done', 'archived'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks (user_id, due_date NULLS LAST);

-- 2. OAuth integrations (AES-GCM-encrypted tokens) ------------------------
CREATE TABLE IF NOT EXISTS integrations (
  user_id           TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  access_token_enc  BYTEA NOT NULL,
  refresh_token_enc BYTEA NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  scopes            TEXT[] NOT NULL,
  connected_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Daily briefings ------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_briefings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  brief_date  DATE NOT NULL,
  payload     JSONB NOT NULL,
  model       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT daily_briefings_user_date UNIQUE (user_id, brief_date)
);

-- 4. daily.dev feed cache -------------------------------------------------
CREATE TABLE IF NOT EXISTS dailydev_cache (
  user_id     TEXT NOT NULL,
  feed        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL,
  CONSTRAINT dailydev_cache_user_feed PRIMARY KEY (user_id, feed)
);

-- 5. LeetCode spaced-repetition ------------------------------------------
CREATE TABLE IF NOT EXISTS leetcode_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  notes       TEXT,
  confidence  INT DEFAULT 1 CHECK (confidence BETWEEN 1 AND 5),
  next_review DATE,
  ease        REAL DEFAULT 2.5,
  CONSTRAINT leetcode_patterns_user_name UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS leetcode_attempts (
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
CREATE INDEX IF NOT EXISTS idx_leetcode_attempts_user ON leetcode_attempts (user_id, attempted_at DESC);

-- 6. Knowledge items (principles) + email triage -------------------------
CREATE TABLE IF NOT EXISTS knowledge_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book            TEXT NOT NULL,
  chapter         TEXT,
  idea            TEXT NOT NULL,
  tags            TEXT[] DEFAULT '{}',
  weight          REAL DEFAULT 1.0,
  accepted_count  INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_triage (
  gmail_msg_id      TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  category          TEXT CHECK (category IN ('reply', 'fyi', 'task', 'ignore')),
  summary           TEXT,
  suggested_task_id UUID REFERENCES tasks(id),
  triaged_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 7. RLS: mirror the existing `tasks` app.current_user_id pattern ---------
ALTER TABLE integrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dailydev_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leetcode_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_triage    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY['integrations','daily_briefings','dailydev_cache',
                            'leetcode_patterns','leetcode_attempts','email_triage'];
    i INT;
BEGIN
    FOR i IN 1..COALESCE(array_length(tables, 1), 0) LOOP
        t := tables[i];
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS %I_select ON %I FOR SELECT
                USING (user_id = current_setting(''app.current_user_id'', true))',
            t, t);
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS %I_insert ON %I FOR INSERT
                WITH CHECK (user_id = current_setting(''app.current_user_id'', true))',
            t, t);
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS %I_update ON %I FOR UPDATE
                USING (user_id = current_setting(''app.current_user_id'', true))',
            t, t);
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS %I_delete ON %I FOR DELETE
                USING (user_id = current_setting(''app.current_user_id'', true))',
            t, t);
    END LOOP;
END$$;
