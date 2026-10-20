-- Phase 6: user profiles (onboarding + prompt assembly), additive only.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id               TEXT PRIMARY KEY,
  name                  TEXT,
  target_interview_date DATE,
  focus_areas           TEXT[] NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
    pol TEXT;
BEGIN
    pol := 'user_profiles_select';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = pol) THEN
        EXECUTE format(
            'CREATE POLICY %I ON user_profiles FOR SELECT
                USING (user_id = current_setting(''app.current_user_id'', true))', pol);
    END IF;
    pol := 'user_profiles_upsert';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = pol) THEN
        EXECUTE format(
            'CREATE POLICY %I ON user_profiles FOR INSERT
                WITH CHECK (user_id = current_setting(''app.current_user_id'', true))', pol);
    END IF;
    pol := 'user_profiles_update';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = pol) THEN
        EXECUTE format(
            'CREATE POLICY %I ON user_profiles FOR UPDATE
                USING (user_id = current_setting(''app.current_user_id'', true))
                WITH CHECK (user_id = current_setting(''app.current_user_id'', true))', pol);
    END IF;
END $$;
