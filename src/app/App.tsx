import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  // Redirect to signup if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate('/signup');
    }
  }, [user, loading, navigate]);

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vintage-cream">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-vintage-brown mx-auto mb-4"></div>
          <p className="text-vintage-brown font-serif">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

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

  return (
    <div className="relative font-serif">

      {/* BEGIN: Navigation Header */}
      <nav className="bg-vintage-red text-white py-3 shadow-md relative z-20">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xl font-bold tracking-wide hover:text-vintage-cream transition-colors">
              Eisenhower Matrix
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-white hover:text-vintage-cream transition-colors font-medium"
            >
              Dashboard
            </Link>
            <Link
              to="/profile"
              className="text-white hover:text-vintage-cream transition-colors font-medium"
            >
              Profile
            </Link>
            {user && (
              <button
                onClick={signOutUser}
                className="bg-vintage-brown hover:bg-vintage-brown/80 text-white px-4 py-2 rounded transition-colors text-sm font-medium"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </nav>
      {/* END: Navigation Header */}

      {/* BEGIN: Main Content */}
      <main className="relative z-10 container mx-auto px-4 py-8 md:py-12 min-h-screen flex flex-col items-center">
        {/* BEGIN: Header Section */}
        <header className="text-center mb-10 md:mb-14">
          <h1 className="text-5xl md:text-6xl font-bold text-vintage-brown mb-2 tracking-wide drop-shadow-sm main-title-shadow">
            Eisenhower Matrix Dashboard
          </h1>
          <p className="text-lg md:text-xl text-vintage-brown/80 font-hand font-bold tracking-wider">
            Organize your tasks by urgency and importance
          </p>
        </header>
        {/* END: Header Section */}

        {/* BEGIN: Matrix Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-6xl">
          {/* QUADRANT 1: DO (Important & Urgent) */}
          <MatrixQuadrant
            title="Do"
            subtitle="Important & Urgent"
            headerColor="bg-do-header"
            icon="fa-solid fa-fire"
            tasks={tasks.urgent_important}
            onAddTask={(text) => addTaskToDB('urgent_important', text)}
            onDeleteTask={(id) => deleteTaskFromApp('urgent_important', id)}
          />

          {/* QUADRANT 2: DECIDE (Important & Not Urgent) */}
          <MatrixQuadrant
            title="Decide"
            subtitle="Important & Not Urgent"
            headerColor="bg-decide-header"
            icon="fa-regular fa-clock"
            tasks={tasks.not_urgent_important}
            onAddTask={(text) => addTaskToDB('not_urgent_important', text)}
            onDeleteTask={(id) => deleteTaskFromApp('not_urgent_important', id)}
          />

          {/* QUADRANT 3: DELEGATE (Not Important & Urgent) */}
          <MatrixQuadrant
            title="Delegate"
            subtitle="Not Important & Urgent"
            headerColor="bg-delegate-header"
            icon="fa-solid fa-bullseye"
            tasks={tasks.urgent_not_important}
            onAddTask={(text) => addTaskToDB('urgent_not_important', text)}
            onDeleteTask={(id) => deleteTaskFromApp('urgent_not_important', id)}
          />

          {/* QUADRANT 4: DELETE (Not Important & Not Urgent) */}
          <MatrixQuadrant
            title="Delete"
            subtitle="Not Important & Not Urgent"
            headerColor="bg-delete-header"
            icon="fa-solid fa-ban"
            tasks={tasks.not_urgent_not_important}
            onAddTask={(text) => addTaskToDB('not_urgent_not_important', text)}
            onDeleteTask={(id) => deleteTaskFromApp('not_urgent_not_important', id)}
          />
        </section>
        {/* END: Matrix Grid */}
      </main>
      {/* END: Main Content */}
    </div>
  );
}
