-- Phase 3: calendar sync + multi-integration fix.
-- Additive on top of 0001/0002; safe to run once against the live project.

-- 1. integrations currently has PRIMARY KEY (user_id) — that allows exactly
--    one integration per user, contradicting the multi-provider design
--    (calendar now, Gmail next). Re-key to (user_id, provider).
--    (Table is unused in code so far, so the re-key is free.)
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_pkey;
ALTER TABLE integrations ADD PRIMARY KEY (user_id, provider);

-- 2. calendar_events — read-only mirror of the user's next 7 days.
--    Only titles/timestamps are persisted (no attendees, no bodies) per
--    PHASE_3.md profile handling.
CREATE TABLE IF NOT EXISTS calendar_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  event_id   TEXT NOT NULL,               -- Google event id / iCal UID
  title      TEXT NOT NULL DEFAULT '',
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  busy       BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT calendar_events_user_event UNIQUE (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_user_start
  ON calendar_events (user_id, start_at);

-- 3. RLS: mirror the app.current_user_id pattern
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'calendar_events' AND policyname = 'calendar_events_user_select'
    ) THEN
        CREATE POLICY calendar_events_user_select ON calendar_events
          FOR SELECT USING (user_id = current_setting('app.current_user_id', true));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'calendar_events' AND policyname = 'calendar_events_user_insert'
    ) THEN
        CREATE POLICY calendar_events_user_insert ON calendar_events
          FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'calendar_events' AND policyname = 'calendar_events_user_update'
    ) THEN
        CREATE POLICY calendar_events_user_update ON calendar_events
          FOR UPDATE USING (user_id = current_setting('app.current_user_id', true));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'calendar_events' AND policyname = 'calendar_events_user_delete'
    ) THEN
        CREATE POLICY calendar_events_user_delete ON calendar_events
          FOR DELETE USING (user_id = current_setting('app.current_user_id', true));
    END IF;
END$$;
