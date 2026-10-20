-- 0009_priority_classes.sql — 2026-10-20, user-directed rewrite.
--
-- The Eisenhower quadrant model is retired. tasks carries a single
-- `priority` axis instead, in the copilot's voice:
--
--   now      = worth doing today — real deadline or immediate outcome
--   schedule = long-term value — needs a planned block (deep work, study,
--              interview prep)
--   delegate = time-critical but low impact — hand off, automate, minimize
--   drop     = recognizable noise — probably shouldn't exist
--
-- Value mapping from the retired quadrant strings:
--   urgent_important            -> now
--   not_urgent_important        -> schedule
--   urgent_not_important        -> delegate
--   not_urgent_not_important    -> drop
--
-- The 0007 baseline was corrected in place to this shape; the live database
-- reaches the same end state through this migration. Idempotent.

-- Idempotent rename: only when the old column still exists.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'tasks' AND column_name = 'quadrant') THEN
        ALTER TABLE tasks RENAME COLUMN quadrant TO priority;
    END IF;
END $$;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_quadrant_check;

UPDATE tasks
   SET priority = CASE priority
       WHEN 'urgent_important'         THEN 'now'
       WHEN 'not_urgent_important'     THEN 'schedule'
       WHEN 'urgent_not_important'     THEN 'delegate'
       WHEN 'not_urgent_not_important' THEN 'drop'
       ELSE priority
   END
 WHERE priority IN ('urgent_important','not_urgent_important',
                    'urgent_not_important','not_urgent_not_important');

-- CHECK constraints are unnamed in some historic paths; drop any that
-- references the old values, then add the canonical one.
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'tasks'::regclass AND contype = 'c'
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conname = c.conname
               AND pg_get_constraintdef(oid) ILIKE '%urgent%'
        ) THEN
            EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', c.conname);
        END IF;
    END LOOP;
END $$;

DO $$
DECLARE
    c RECORD;
    have_priority_check BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_priority_check'
    ) INTO have_priority_check;

    IF NOT have_priority_check THEN
        ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
            CHECK (priority = ANY (ARRAY['now','schedule','delegate','drop']));
    END IF;
END $$;
