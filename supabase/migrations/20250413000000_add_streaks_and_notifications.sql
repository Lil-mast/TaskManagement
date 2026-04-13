-- Migration: Add streak tracking and notifications support
-- Created: 2025-04-13

-- ============================================
-- TASK COMPLETIONS TABLE
-- Track when users complete tasks (Well Done)
-- ============================================
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  quadrant TEXT NOT NULL CHECK (quadrant IN ('urgent_important', 'urgent_not_important', 'not_urgent_important', 'not_urgent_not_important')),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own completions
CREATE POLICY "Users can view their own completions" ON task_completions
  FOR SELECT USING (user_id = current_setting('app.current_user_id'));

-- Users can only insert their own completions
CREATE POLICY "Users can insert their own completions" ON task_completions
  FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id'));

-- ============================================
-- USER STREAKS TABLE
-- Track current and longest streaks per user
-- ============================================
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id TEXT PRIMARY KEY,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_completion_date DATE,
  week_task_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

-- Users can only view their own streak
CREATE POLICY "Users can view their own streak" ON user_streaks
  FOR SELECT USING (user_id = current_setting('app.current_user_id'));

-- ============================================
-- USER NOTIFICATIONS TABLE
-- Track email preferences and sent notifications
-- ============================================
CREATE TABLE IF NOT EXISTS user_notifications (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  welcome_email_sent BOOLEAN DEFAULT FALSE,
  streak_milestone_7_sent BOOLEAN DEFAULT FALSE,
  last_weekly_report TIMESTAMP WITH TIME ZONE,
  email_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notification settings
CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT USING (user_id = current_setting('app.current_user_id'));

-- Users can update their own notification settings
CREATE POLICY "Users can update their own notifications" ON user_notifications
  FOR UPDATE USING (user_id = current_setting('app.current_user_id'));

-- ============================================
-- FUNCTION: Calculate and update streak on task completion
-- ============================================
CREATE OR REPLACE FUNCTION calculate_streak()
RETURNS TRIGGER AS $$
DECLARE
  user_record RECORD;
  today DATE := CURRENT_DATE;
  yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  new_streak INTEGER;
  milestone_7_reached BOOLEAN := FALSE;
BEGIN
  -- Get or create user streak record
  SELECT * INTO user_record FROM user_streaks WHERE user_id = NEW.user_id;
  
  IF NOT FOUND THEN
    -- First completion ever - streak starts at 1
    INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_completion_date, week_task_count)
    VALUES (NEW.user_id, 1, 1, today, 1);
    new_streak := 1;
  ELSE
    -- Check if already completed today
    IF user_record.last_completion_date = today THEN
      -- Already completed today, just update week count
      UPDATE user_streaks 
      SET week_task_count = week_task_count + 1,
          updated_at = NOW()
      WHERE user_id = NEW.user_id;
      RETURN NEW;
    END IF;
    
    -- Calculate new streak
    IF user_record.last_completion_date = yesterday THEN
      -- Consecutive day - increment streak
      new_streak := user_record.current_streak + 1;
    ELSE
      -- Streak broken - start over
      new_streak := 1;
    END IF;
    
    -- Check if milestone 7 reached
    IF new_streak = 7 AND (user_record.current_streak < 7 OR user_record.last_completion_date != today) THEN
      milestone_7_reached := TRUE;
    END IF;
    
    -- Update streak record
    UPDATE user_streaks 
    SET current_streak = new_streak,
        longest_streak = GREATEST(longest_streak, new_streak),
        last_completion_date = today,
        week_task_count = CASE 
          WHEN last_completion_date < today - INTERVAL '7 days' THEN 1 
          ELSE week_task_count + 1 
        END,
        updated_at = NOW()
    WHERE user_id = NEW.user_id;
  END IF;
  
  -- Create notification settings if not exists
  INSERT INTO user_notifications (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate streak on task completion
DROP TRIGGER IF EXISTS calculate_streak_on_completion ON task_completions;
CREATE TRIGGER calculate_streak_on_completion
  AFTER INSERT ON task_completions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_streak();

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_task_completions_user_id ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_completed_at ON task_completions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_completions_user_date ON task_completions(user_id, completed_at DESC);

-- ============================================
-- FUNCTION: Get weekly stats for a user
-- ============================================
CREATE OR REPLACE FUNCTION get_weekly_stats(p_user_id TEXT)
RETURNS TABLE (
  total_completed INTEGER,
  urgent_important_count INTEGER,
  urgent_not_important_count INTEGER,
  not_urgent_important_count INTEGER,
  not_urgent_not_important_count INTEGER,
  current_streak INTEGER,
  longest_streak INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE((SELECT COUNT(*)::INTEGER FROM task_completions 
              WHERE user_id = p_user_id AND completed_at >= NOW() - INTERVAL '7 days'), 0) as total_completed,
    COALESCE((SELECT COUNT(*)::INTEGER FROM task_completions 
              WHERE user_id = p_user_id AND quadrant = 'urgent_important' 
              AND completed_at >= NOW() - INTERVAL '7 days'), 0) as urgent_important_count,
    COALESCE((SELECT COUNT(*)::INTEGER FROM task_completions 
              WHERE user_id = p_user_id AND quadrant = 'urgent_not_important' 
              AND completed_at >= NOW() - INTERVAL '7 days'), 0) as urgent_not_important_count,
    COALESCE((SELECT COUNT(*)::INTEGER FROM task_completions 
              WHERE user_id = p_user_id AND quadrant = 'not_urgent_important' 
              AND completed_at >= NOW() - INTERVAL '7 days'), 0) as not_urgent_important_count,
    COALESCE((SELECT COUNT(*)::INTEGER FROM task_completions 
              WHERE user_id = p_user_id AND quadrant = 'not_urgent_not_important' 
              AND completed_at >= NOW() - INTERVAL '7 days'), 0) as not_urgent_not_important_count,
    COALESCE((SELECT current_streak FROM user_streaks WHERE user_id = p_user_id), 0) as current_streak,
    COALESCE((SELECT longest_streak FROM user_streaks WHERE user_id = p_user_id), 0) as longest_streak;
END;
$$ LANGUAGE plpgsql;
