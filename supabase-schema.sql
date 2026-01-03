-- Create the tasks table
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  quadrant TEXT NOT NULL CHECK (quadrant IN ('urgent_important', 'urgent_not_important', 'not_urgent_important', 'not_urgent_not_important')),
  user_id TEXT NOT NULL, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see only their own tasks (Firebase UID support)
CREATE POLICY "Users can view their own tasks" ON tasks
  FOR SELECT USING (user_id = current_setting('app.current_user_id'));

-- Create policy to allow users to insert their own tasks (Firebase UID support)
CREATE POLICY "Users can insert their own tasks" ON tasks
  FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id'));

-- Create policy to allow users to update their own tasks (Firebase UID support)
CREATE POLICY "Users can update their own tasks" ON tasks
  FOR UPDATE USING (user_id = current_setting('app.current_user_id'));

-- Create policy to allow users to delete their own tasks (Firebase UID support)
CREATE POLICY "Users can delete their own tasks" ON tasks
  FOR DELETE USING (user_id = current_setting('app.current_user_id'));