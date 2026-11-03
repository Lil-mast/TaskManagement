-- ============================================================================
-- 0011 — WORKSPACE SUBMISSIONS
-- ============================================================================
-- Stores every code-execution run from the /workspace screen, optionally
-- linked to a leetcode_attempt once the user logs their solve.
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_submissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  language      TEXT        NOT NULL,
  code          TEXT        NOT NULL,
  stdout        TEXT        NOT NULL DEFAULT '',
  stderr        TEXT        NOT NULL DEFAULT '',
  exit_code     INT         NOT NULL DEFAULT 0,
  time_ms       INT         NOT NULL DEFAULT 0,
  -- optional link — set when the user clicks "Log attempt" after a run
  attempt_id    UUID        REFERENCES leetcode_attempts(id) ON DELETE SET NULL,
  -- problem context captured at run time (informational)
  problem_title TEXT,
  problem_url   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workspace_submissions_language_check
    CHECK (language = ANY (ARRAY['python','rust','javascript','c','cpp']))
);

CREATE INDEX IF NOT EXISTS idx_ws_submissions_user_at
  ON workspace_submissions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ws_submissions_user
  ON workspace_submissions (user_id);

CREATE INDEX IF NOT EXISTS idx_ws_submissions_attempt
  ON workspace_submissions (attempt_id)
  WHERE attempt_id IS NOT NULL;
