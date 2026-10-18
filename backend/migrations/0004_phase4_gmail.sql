-- Phase 4: Gmail triage columns.
-- email_triage already exists (0001) with RLS; extend for inbox-tab needs.

-- message metadata (title line for the inbox list; bodies are NEVER persisted)
ALTER TABLE email_triage ADD COLUMN IF NOT EXISTS subject TEXT;

-- lifecycle: open (triaged, awaiting human) → done | task_created
ALTER TABLE email_triage ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'open'
  CHECK (state IN ('open', 'done', 'task_created'));
UPDATE email_triage SET state = 'open' WHERE state IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_triage_user_state
  ON email_triage (user_id, state, triaged_at DESC);
