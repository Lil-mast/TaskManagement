-- Phase 5: weekly review storage + RAG feedback re-weighting columns.
-- Additive on top of 0001–0004; safe to run once against the live project.

-- 1. Weekly reviews (Saturday brief variant) — one row per user/week --------
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  week_start   DATE NOT NULL,          -- ISO Monday of the reviewed week
  payload      JSONB NOT NULL,         -- analytics + Claude verdict
  model        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT weekly_reviews_user_week UNIQUE (user_id, week_start)
);

-- 2. Feedback-loop columns on knowledge_items -------------------------------
-- conflicts: counted when a surfaced principle collides/contradicts user
-- choices (0 for now; the re-weight formula is documented-ready).
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS conflicts INT NOT NULL DEFAULT 0;

-- effective_weight: written by the Phase 5 re-weighting job
--   = base(weight) * (1 + ln(1 + accepted_count)) / (1 + conflicts)
-- (deviation from the raw §7 formula documented in PHASE_5.md: a 1+ floor so
--  never-accepted principles stay neutral instead of collapsing to zero).
-- Quarantine = 0.1 — the job writes this for underperformers; it is a floor
-- for retrieval exclusion (effective_weight <= 0.15 stops surfacing).
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS effective_weight REAL NOT NULL DEFAULT 1.0;

-- 3. Surfaced-principles provenance (R5/§5): every retrieval records which
--    items were surfaced by which flow; the weekly review + re-weight job read
--    acceptance-vs-surfacing from here.
--    probed best-effort — agents keep working if this write fails.
CREATE TABLE IF NOT EXISTS knowledge_surface_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,     -- brief | capture | email
  surfaced_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_surface_user_item
  ON knowledge_surface_log (user_id, knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_surface_time ON knowledge_surface_log (surfaced_at DESC);

-- 4. RLS ---------------------------------------------------------------------
-- NOTE: Postgres has no `CREATE POLICY IF NOT EXISTS`; guard via pg_policies
-- (same idiom as the 0001 baseline).
ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_surface_log ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
    t TEXT;
    act TEXT;
    pol TEXT;
    tables TEXT[] := ARRAY['weekly_reviews','knowledge_surface_log'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        FOREACH act IN ARRAY ARRAY['select','insert','delete'] LOOP
            pol := t || '_' || act;
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE tablename = t AND policyname = pol
            ) THEN
                EXECUTE format(
                    'CREATE POLICY %I ON %I FOR %s %s (user_id = current_setting(''app.current_user_id'', true))',
                    pol, t, upper(act),
                    CASE WHEN act = 'insert' THEN 'WITH CHECK' ELSE 'USING' END
                );
            END IF;
        END LOOP;
    END LOOP;
END $$;
