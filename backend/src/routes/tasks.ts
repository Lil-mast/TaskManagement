import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Validation helpers
const validateTask = (task: any): boolean => {
  return (
    task.title &&
    typeof task.title === 'string' &&
    task.title.trim().length > 0 &&
    task.title.length <= 200 &&
    ['urgent_important', 'urgent_not_important', 'not_urgent_important', 'not_urgent_not_important'].includes(task.quadrant)
  );
};

// Get all tasks for the authenticated user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get tasks error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch tasks',
      });
    }

    // Group tasks by quadrant
    const tasksByQuadrant = {
      urgent_important: tasks.filter(task => task.quadrant === 'urgent_important'),
      urgent_not_important: tasks.filter(task => task.quadrant === 'urgent_not_important'),
      not_urgent_important: tasks.filter(task => task.quadrant === 'not_urgent_important'),
      not_urgent_not_important: tasks.filter(task => task.quadrant === 'not_urgent_not_important'),
    };

    res.json({
      success: true,
      data: tasksByQuadrant,
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Create a new task
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, quadrant } = req.body;

    const taskData = {
      title: title?.trim(),
      description: description?.trim(),
      quadrant,
      user_id: req.user!.id,
    };

    if (!validateTask(taskData)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task data. Title is required and must be 1-200 characters. Quadrant must be valid.',
      });
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single();

    if (error) {
      console.error('Create task error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create task',
      });
    }

    res.status(201).json({
      success: true,
      data: task,
      message: 'Task created successfully',
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Update a task
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, quadrant, completed } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (quadrant !== undefined) updateData.quadrant = quadrant;
    if (completed !== undefined) updateData.completed = completed;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
    }

    // Validate quadrant if provided
    if (quadrant && !['urgent_important', 'urgent_not_important', 'not_urgent_important', 'not_urgent_not_important'].includes(quadrant)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quadrant',
      });
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.user!.id) // Ensure user can only update their own tasks
      .select()
      .single();

    if (error) {
      console.error('Update task error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update task',
      });
    }

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    res.json({
      success: true,
      data: task,
      message: 'Task updated successfully',
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Delete a task
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: task, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user!.id) // Ensure user can only delete their own tasks
      .select()
      .single();

    if (error) {
      console.error('Delete task error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete task',
      });
    }

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Get tasks by quadrant
router.get('/quadrant/:quadrant', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { quadrant } = req.params;
    const validQuadrants = ['urgent_important', 'urgent_not_important', 'not_urgent_important', 'not_urgent_not_important'];

    if (!quadrant || !validQuadrants.includes(quadrant)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quadrant',
      });
    }

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('quadrant', quadrant)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get tasks by quadrant error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch tasks',
      });
    }

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error('Get tasks by quadrant error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Bulk update tasks (for moving between quadrants)
router.patch('/bulk', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskIds, quadrant } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'taskIds must be a non-empty array',
      });
    }

    if (!['urgent_important', 'urgent_not_important', 'not_urgent_important', 'not_urgent_not_important'].includes(quadrant)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quadrant',
      });
    }

    const { data: tasks, error } = await supabase
      .from('tasks')
      .update({
        quadrant,
        updated_at: new Date().toISOString(),
      })
      .in('id', taskIds)
      .eq('user_id', req.user!.id)
      .select();

    if (error) {
      console.error('Bulk update tasks error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update tasks',
      });
    }

    res.json({
      success: true,
      data: tasks,
      message: `${tasks.length} tasks updated successfully`,
    });
  } catch (error) {
    console.error('Bulk update tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;