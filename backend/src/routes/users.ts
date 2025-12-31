import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get user statistics
router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get task counts by quadrant
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('quadrant, completed')
      .eq('user_id', userId);

    if (tasksError) {
      console.error('Get user stats error:', tasksError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user statistics',
      });
    }

    // Calculate statistics
    const stats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(task => task.completed).length,
      pendingTasks: tasks.filter(task => !task.completed).length,
      tasksByQuadrant: {
        urgent_important: tasks.filter(task => task.quadrant === 'urgent_important').length,
        urgent_not_important: tasks.filter(task => task.quadrant === 'urgent_not_important').length,
        not_urgent_important: tasks.filter(task => task.quadrant === 'not_urgent_important').length,
        not_urgent_not_important: tasks.filter(task => task.quadrant === 'not_urgent_not_important').length,
      },
      completionRate: tasks.length > 0 ? Math.round((tasks.filter(task => task.completed).length / tasks.length) * 100) : 0,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Get user preferences
router.get('/preferences', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', req.user!.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Get preferences error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user preferences',
      });
    }

    // Return default preferences if none exist
    const defaultPreferences = {
      default_view: 'grid',
      task_color_theme: 'default',
      notifications_enabled: true,
      auto_save: true,
    };

    res.json({
      success: true,
      data: preferences || defaultPreferences,
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Update user preferences
router.put('/preferences', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { default_view, task_color_theme, notifications_enabled, auto_save } = req.body;

    const preferencesData = {
      user_id: req.user!.id,
      default_view: default_view || 'grid',
      task_color_theme: task_color_theme || 'default',
      notifications_enabled: notifications_enabled !== undefined ? notifications_enabled : true,
      auto_save: auto_save !== undefined ? auto_save : true,
      updated_at: new Date().toISOString(),
    };

    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .upsert(preferencesData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Update preferences error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update preferences',
      });
    }

    res.json({
      success: true,
      data: preferences,
      message: 'Preferences updated successfully',
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Get user activity/recent tasks
router.get('/activity', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Get user activity error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user activity',
      });
    }

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Delete user account (soft delete - mark as inactive)
router.delete('/account', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Mark user as inactive instead of hard delete
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Delete account error:', profileError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete account',
      });
    }

    // Optionally mark tasks as archived instead of deleting
    const { error: tasksError } = await supabase
      .from('tasks')
      .update({ is_archived: true })
      .eq('user_id', userId);

    if (tasksError) {
      console.error('Archive tasks error:', tasksError);
      // Don't fail the whole operation for this
    }

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;