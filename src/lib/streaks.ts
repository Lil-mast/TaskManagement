import { supabase, isSupabaseConfigured } from './supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Track a task completion and update streak
 */
export const trackTaskCompletion = async (
  userId: string,
  taskId: string,
  quadrant: string
): Promise<{ success: boolean; streak?: number; milestoneReached?: boolean; error?: string }> => {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('track-streak', {
      body: { userId, taskId, quadrant },
    });

    if (error) {
      console.error('Error tracking streak:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      streak: data?.streak?.current,
      milestoneReached: data?.streak?.milestoneReached,
    };
  } catch (err) {
    console.error('Failed to track completion:', err);
    return { success: false, error: 'Failed to track completion' };
  }
};

/**
 * Get user's current streak
 */
export const getUserStreak = async (userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastCompletionDate?: string;
  weekTaskCount: number;
  error?: string;
}> => {
  if (!isSupabaseConfigured || !supabase) {
    return { currentStreak: 0, longestStreak: 0, weekTaskCount: 0, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching streak:', error);
      return { currentStreak: 0, longestStreak: 0, weekTaskCount: 0, error: error.message };
    }

    return {
      currentStreak: data?.current_streak || 0,
      longestStreak: data?.longest_streak || 0,
      lastCompletionDate: data?.last_completion_date,
      weekTaskCount: data?.week_task_count || 0,
    };
  } catch (err) {
    console.error('Failed to get streak:', err);
    return { currentStreak: 0, longestStreak: 0, weekTaskCount: 0, error: 'Failed to get streak' };
  }
};

/**
 * Initialize user notifications (call on signup)
 */
export const initializeUserNotifications = async (
  userId: string,
  email: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('welcome-user', {
      body: { userId, email },
    });

    if (error) {
      console.error('Error initializing user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to initialize user:', err);
    return { success: false, error: 'Failed to initialize user' };
  }
};

/**
 * Update user's notification preferences
 */
export const updateNotificationPreferences = async (
  userId: string,
  preferences: {
    emailEnabled?: boolean;
    email?: string;
  }
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('user_notifications')
      .update({
        email_enabled: preferences.emailEnabled,
        email: preferences.email,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating preferences:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to update preferences:', err);
    return { success: false, error: 'Failed to update preferences' };
  }
};

/**
 * Get weekly stats for user
 */
export const getWeeklyStats = async (userId: string): Promise<{
  totalCompleted: number;
  urgentImportant: number;
  urgentNotImportant: number;
  notUrgentImportant: number;
  notUrgentNotImportant: number;
  currentStreak: number;
  longestStreak: number;
  error?: string;
}> => {
  if (!isSupabaseConfigured || !supabase) {
    return {
      totalCompleted: 0,
      urgentImportant: 0,
      urgentNotImportant: 0,
      notUrgentImportant: 0,
      notUrgentNotImportant: 0,
      currentStreak: 0,
      longestStreak: 0,
      error: 'Supabase not configured',
    };
  }

  try {
    const { data, error } = await supabase
      .rpc('get_weekly_stats', { p_user_id: userId });

    if (error) {
      console.error('Error fetching weekly stats:', error);
      return {
        totalCompleted: 0,
        urgentImportant: 0,
        urgentNotImportant: 0,
        notUrgentImportant: 0,
        notUrgentNotImportant: 0,
        currentStreak: 0,
        longestStreak: 0,
        error: error.message,
      };
    }

    const stats = data?.[0] || {};

    return {
      totalCompleted: stats.total_completed || 0,
      urgentImportant: stats.urgent_important_count || 0,
      urgentNotImportant: stats.urgent_not_important_count || 0,
      notUrgentImportant: stats.not_urgent_important_count || 0,
      notUrgentNotImportant: stats.not_urgent_not_important_count || 0,
      currentStreak: stats.current_streak || 0,
      longestStreak: stats.longest_streak || 0,
    };
  } catch (err) {
    console.error('Failed to get weekly stats:', err);
    return {
      totalCompleted: 0,
      urgentImportant: 0,
      urgentNotImportant: 0,
      notUrgentImportant: 0,
      notUrgentNotImportant: 0,
      currentStreak: 0,
      longestStreak: 0,
      error: 'Failed to get weekly stats',
    };
  }
};
