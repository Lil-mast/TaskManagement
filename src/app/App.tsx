import { useState, useEffect } from 'react';
import { Flame, Clock, Target, Ban } from 'lucide-react';
import { MatrixQuadrant } from './components/MatrixQuadrant';
import { useAuth } from '../lib/auth';
import { getTasks, addTask, deleteTask as deleteTaskFromDB } from '../lib/supabase';
import type { Task } from './components/TaskCard';

interface TasksByQuadrant {
  urgent_important: Task[];
  urgent_not_important: Task[];
  not_urgent_important: Task[];
  not_urgent_not_important: Task[];
}

export default function App() {
  const { user, loading, signIn, signOutUser, isSupabaseMode } = useAuth();
  const [tasks, setTasks] = useState<TasksByQuadrant>({
    urgent_important: [],
    urgent_not_important: [],
    not_urgent_important: [],
    not_urgent_not_important: [],
  });
  const [loadingTasks, setLoadingTasks] = useState(false);

  useEffect(() => {
    if (isSupabaseMode && user && user.id !== 'local-user') {
      loadTasks();
    } else if (!isSupabaseMode) {
      // Load from localStorage in local mode
      const savedTasks = localStorage.getItem('eisenhower-tasks');
      if (savedTasks) {
        try {
          const parsedTasks = JSON.parse(savedTasks);
          setTasks(parsedTasks);
        } catch (error) {
          console.error('Error loading tasks from localStorage:', error);
        }
      }
    } else {
      setTasks({
        urgent_important: [],
        urgent_not_important: [],
        not_urgent_important: [],
        not_urgent_not_important: [],
      });
    }
  }, [user, isSupabaseMode]);

  const loadTasks = async () => {
    if (!user || !isSupabaseMode) return;
    setLoadingTasks(true);
    const { data, error } = await getTasks(user.id);
    if (error) {
      console.error('Error loading tasks:', error);
    } else {
      const tasksByQuadrant: TasksByQuadrant = {
        urgent_important: [],
        urgent_not_important: [],
        not_urgent_important: [],
        not_urgent_not_important: [],
      };
      data?.forEach((task: Task) => {
        if (tasksByQuadrant[task.quadrant as keyof TasksByQuadrant]) {
          tasksByQuadrant[task.quadrant as keyof TasksByQuadrant].push(task);
        }
      });
      setTasks(tasksByQuadrant);
    }
    setLoadingTasks(false);
  };

  const saveTasksToLocalStorage = (newTasks: TasksByQuadrant) => {
    if (!isSupabaseMode) {
      localStorage.setItem('eisenhower-tasks', JSON.stringify(newTasks));
    }
  };

  const addTaskToDB = async (quadrant: keyof TasksByQuadrant, title: string) => {
    if (isSupabaseMode && !user) return;

    if (isSupabaseMode) {
      const { data, error } = await addTask({
        title,
        quadrant,
        user_id: user!.id,
      });
      if (error) {
        console.error('Error adding task:', error);
      } else if (data) {
        setTasks((prev) => ({
          ...prev,
          [quadrant]: [...prev[quadrant], data[0]],
        }));
      }
    } else {
      // Local mode
      const newTask: Task = {
        id: Date.now().toString() + Math.random(),
        title,
        quadrant,
        user_id: 'local-user',
        created_at: new Date().toISOString(),
      };
      setTasks((prev) => {
        const newTasks = {
          ...prev,
          [quadrant]: [...prev[quadrant], newTask],
        };
        saveTasksToLocalStorage(newTasks);
        return newTasks;
      });
    }
  };

  const deleteTaskFromApp = async (quadrant: keyof TasksByQuadrant, taskId: string) => {
    if (isSupabaseMode) {
      const { error } = await deleteTaskFromDB(taskId);
      if (error) {
        console.error('Error deleting task:', error);
      } else {
        setTasks((prev) => ({
          ...prev,
          [quadrant]: prev[quadrant].filter((task) => task.id !== taskId),
        }));
      }
    } else {
      // Local mode
      setTasks((prev) => {
        const newTasks = {
          ...prev,
          [quadrant]: prev[quadrant].filter((task) => task.id !== taskId),
        };
        saveTasksToLocalStorage(newTasks);
        return newTasks;
      });
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (isSupabaseMode && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Eisenhower Matrix</h1>
          <p className="text-gray-600 mb-6">Sign in to manage your tasks</p>
          <button
            onClick={signIn}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-gray-900 mb-2">Eisenhower Matrix</h1>
            <p className="text-gray-600">
              Organize your tasks by urgency and importance
            </p>
            {isSupabaseMode && (
              <p className="text-sm text-gray-500 mt-1">Connected to Supabase</p>
            )}
            {!isSupabaseMode && (
              <p className="text-sm text-gray-500 mt-1">Local mode - tasks saved in browser</p>
            )}
          </div>
          {isSupabaseMode && user && (
            <button
              onClick={signOutUser}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Sign Out
            </button>
          )}
        </div>

        {/* Matrix Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Urgent Section Header */}
          <div className="lg:col-span-1">
            <div className="bg-red-100 rounded-t-xl px-4 py-3 border-2 border-b-0 border-red-400">
              <h2 className="text-red-800 text-center flex items-center justify-center gap-2">
                <Flame size={24} />
                Urgent
              </h2>
            </div>
            <div className="grid gap-6">
              {/* Do - Urgent & Important */}
              <MatrixQuadrant
                title="Do"
                subtitle="Important & Urgent"
                color="#dc2626"
                icon={<Flame size={24} />}
                tasks={tasks.urgent_important}
                onAddTask={(text) => addTaskToDB('urgent_important', text)}
                onDeleteTask={(id) => deleteTaskFromApp('urgent_important', id)}
              />

              {/* Delegate - Urgent & Not Important */}
              <MatrixQuadrant
                title="Delegate"
                subtitle="Not Important & Urgent"
                color="#f97316"
                icon={<Target size={24} />}
                tasks={tasks.urgent_not_important}
                onAddTask={(text) => addTaskToDB('urgent_not_important', text)}
                onDeleteTask={(id) => deleteTaskFromApp('urgent_not_important', id)}
              />
            </div>
          </div>

          {/* Not Urgent Section Header */}
          <div className="lg:col-span-1">
            <div className="bg-blue-100 rounded-t-xl px-4 py-3 border-2 border-b-0 border-blue-400">
              <h2 className="text-blue-800 text-center flex items-center justify-center gap-2">
                <Clock size={24} />
                Not Urgent
              </h2>
            </div>
            <div className="grid gap-6">
              {/* Decide - Not Urgent & Important */}
              <MatrixQuadrant
                title="Decide"
                subtitle="Important & Not Urgent"
                color="#3b82f6"
                icon={<Clock size={24} />}
                tasks={tasks.not_urgent_important}
                onAddTask={(text) => addTaskToDB('not_urgent_important', text)}
                onDeleteTask={(id) => deleteTaskFromApp('not_urgent_important', id)}
              />

              {/* Delete - Not Urgent & Not Important */}
              <MatrixQuadrant
                title="Delete"
                subtitle="Not Important & Not Urgent"
                color="#6b7280"
                icon={<Ban size={24} />}
                tasks={tasks.not_urgent_not_important}
                onAddTask={(text) => addTaskToDB('not_urgent_not_important', text)}
                onDeleteTask={(id) => deleteTaskFromApp('not_urgent_not_important', id)}
              />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-8 bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-gray-900 mb-4">How to use this matrix:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex gap-3">
              <div className="text-red-600">
                <Flame size={20} />
              </div>
              <div>
                <p className="text-gray-900">Do First</p>
                <p className="text-gray-600">Critical tasks requiring immediate attention</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-blue-600">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-gray-900">Schedule</p>
                <p className="text-gray-600">Important tasks to plan and schedule</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-orange-600">
                <Target size={20} />
              </div>
              <div>
                <p className="text-gray-900">Delegate</p>
                <p className="text-gray-600">Tasks that others can handle</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-gray-600">
                <Ban size={20} />
              </div>
              <div>
                <p className="text-gray-900">Eliminate</p>
                <p className="text-gray-600">Low-value tasks to minimize or remove</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
