import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MatrixQuadrant } from './components/MatrixQuadrant';
import { DNDProviderWrapper } from './components/DNDProvider';
import { TrashViewer } from './components/TrashViewer';
import { MonthlyReport } from './components/MonthlyReport';
import { useAuth } from '../lib/auth';
import { getTasks, addTask, deleteTask as deleteTaskFromDB, updateTask } from '../lib/supabase';
import { TrashManager } from '../lib/trashManager';
import type { Task } from './components/TaskCard';
import SolarLoader from './components/SolarLoader';

interface TasksByQuadrant {
  urgent_important: Task[];
  urgent_not_important: Task[];
  not_urgent_important: Task[];
  not_urgent_not_important: Task[];
}

export default function App() {
  const { user, loading, signIn, signOutUser, isFirebaseMode, isSupabaseMode } = useAuth();
  const navigate = useNavigate();

  // State declarations
  const [tasks, setTasks] = useState<TasksByQuadrant>({
    urgent_important: [],
    urgent_not_important: [],
    not_urgent_important: [],
    not_urgent_not_important: [],
  });
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [motivationQuote, setMotivationQuote] = useState<string | null>(null);
  const [showMotivation, setShowMotivation] = useState(false);

  useEffect(() => {
    if (isFirebaseMode && user && user.id !== 'local-user') {
      loadTasks();
    } else if (!isFirebaseMode && !isSupabaseMode) {
      // Load from localStorage in local mode (neither Firebase nor Supabase configured)
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
  }, [user, isFirebaseMode, isSupabaseMode]);

  // Authentication redirect logic is now handled by the router

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vintage-cream">
        <div className="text-center">
          <SolarLoader size={30} speed={1} className="mb-8" />
          <p className="text-vintage-brown font-serif text-lg">Loading Eisenhower Matrix...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated in Firebase mode (will redirect)
  if (!user && isFirebaseMode) {
    return null;
  }

  const loadTasks = async () => {
    if (!user || !isFirebaseMode) return;
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
    if (!isFirebaseMode && !isSupabaseMode) {
      localStorage.setItem('eisenhower-tasks', JSON.stringify(newTasks));
    }
  };

  const addTaskToDB = async (quadrant: keyof TasksByQuadrant, title: string, description?: string) => {
    if ((isFirebaseMode || isSupabaseMode) && !user) return;

    if (isFirebaseMode || isSupabaseMode) {
      const { data, error } = await addTask({
        title,
        description,
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
      // Local mode - neither Firebase nor Supabase configured
      const newTask: Task = {
        id: Date.now().toString() + Math.random(),
        title,
        description,
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
    if (isFirebaseMode || isSupabaseMode) {
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
      // Local mode - neither Firebase nor Supabase configured
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

  const updateTaskInApp = async (taskId: string, title: string, description?: string) => {
    // Find which quadrant contains this task
    let targetQuadrant: keyof TasksByQuadrant | null = null;
    let taskIndex = -1;

    for (const [quadrant, quadrantTasks] of Object.entries(tasks)) {
      const index = quadrantTasks.findIndex((task: Task) => task.id === taskId);
      if (index !== -1) {
        targetQuadrant = quadrant as keyof TasksByQuadrant;
        taskIndex = index;
        break;
      }
    }

    if (!targetQuadrant || taskIndex === -1) return;

    if (isFirebaseMode || isSupabaseMode) {
      const { data, error } = await updateTask(taskId, { title, description });
      if (error) {
        console.error('Error updating task:', error);
      } else if (data && data[0]) {
        setTasks((prev) => ({
          ...prev,
          [targetQuadrant]: prev[targetQuadrant].map((task, index) =>
            index === taskIndex ? { ...task, ...data[0] } : task
          ),
        }));
      }
    } else {
      // Local mode - neither Firebase nor Supabase configured
      setTasks((prev) => {
        const newTasks = {
          ...prev,
          [targetQuadrant]: prev[targetQuadrant].map((task, index) =>
            index === taskIndex ? { ...task, title, description } : task
          ),
        };
        saveTasksToLocalStorage(newTasks);
        return newTasks;
      });
    }
  };

  const moveTaskBetweenQuadrants = async (taskId: string, fromQuadrant: string, toQuadrant: string) => {
    if (fromQuadrant === toQuadrant) return;

    // Find and remove the task from the source quadrant
    const sourceTasks = tasks[fromQuadrant as keyof TasksByQuadrant];
    const taskToMove = sourceTasks.find(task => task.id === taskId);
    
    if (!taskToMove) return;

    if (isFirebaseMode || isSupabaseMode) {
      // Update the task's quadrant in database
      const { data, error } = await updateTask(taskId, { quadrant: toQuadrant });
      if (error) {
        console.error('Error moving task:', error);
        return;
      }
      
      // Update local state
      setTasks((prev) => {
        const newTasks = { ...prev };
        // Remove from source
        newTasks[fromQuadrant as keyof TasksByQuadrant] = prev[fromQuadrant as keyof TasksByQuadrant].filter(
          task => task.id !== taskId
        );
        // Add to destination
        newTasks[toQuadrant as keyof TasksByQuadrant] = [
          ...prev[toQuadrant as keyof TasksByQuadrant],
          { ...taskToMove, quadrant: toQuadrant }
        ];
        return newTasks;
      });
    } else {
      // Local mode - neither Firebase nor Supabase configured
      setTasks((prev) => {
        const newTasks = { ...prev };
        // Remove from source
        newTasks[fromQuadrant as keyof TasksByQuadrant] = prev[fromQuadrant as keyof TasksByQuadrant].filter(
          task => task.id !== taskId
        );
        // Add to destination
        newTasks[toQuadrant as keyof TasksByQuadrant] = [
          ...prev[toQuadrant as keyof TasksByQuadrant],
          { ...taskToMove, quadrant: toQuadrant }
        ];
        saveTasksToLocalStorage(newTasks);
        return newTasks;
      });
    }
  };

  const handleWellDone = (task: Task) => {
    // Add task to trash and get motivation quote
    const quote = TrashManager.addToTrash(task);
    
    // Show motivation popup
    setMotivationQuote(quote);
    setShowMotivation(true);
    setTimeout(() => setShowMotivation(false), 5000);

    // Remove task from current quadrant
    const quadrant = task.quadrant as keyof TasksByQuadrant;
    setTasks(prev => {
      const newTasks = {
        ...prev,
        [quadrant]: prev[quadrant].filter(t => t.id !== task.id)
      };
      saveTasksToLocalStorage(newTasks);
      return newTasks;
    });
  };

  return (
    <DNDProviderWrapper>
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
                to="/app"
                className="text-white hover:text-vintage-cream transition-colors font-medium"
              >
                Dashboard
              </Link>
              <button
                onClick={() => setShowReport(!showReport)}
                className="text-white hover:text-vintage-cream transition-colors font-medium"
              >
                {showReport ? 'Back to Tasks' : 'Monthly Report'}
              </button>
              <button
                onClick={() => setShowTrash(!showTrash)}
                className="text-white hover:text-vintage-cream transition-colors font-medium"
              >
                {showTrash ? 'Back to Tasks' : 'Trash'}
              </button>
              <Link
                to="/profile"
                className="text-white hover:text-vintage-cream transition-colors font-medium"
              >
                Profile
              </Link>
              <button
                onClick={signOutUser}
                className="bg-vintage-brown hover:bg-vintage-brown/80 text-white px-4 py-2 rounded transition-colors text-sm font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </nav>
        {/* END: Navigation Header */}

        {/* Motivation Quote Popup */}
        {showMotivation && motivationQuote && (
          <div className="fixed top-20 right-4 z-50 max-w-md bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-lg shadow-lg transform transition-all duration-300 ease-in-out">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⭐</span>
              <div>
                <p className="font-semibold">Well Done!</p>
                <p className="text-sm">{motivationQuote}</p>
              </div>
            </div>
          </div>
        )}

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

        {/* Task Loading State */}
        {loadingTasks && !showTrash && !showReport && (
          <div className="flex flex-col items-center justify-center py-12">
            <SolarLoader size={25} speed={1.5} className="mb-6" />
            <p className="text-vintage-brown font-serif text-lg">Loading your tasks...</p>
          </div>
        )}

        {/* Show Report, Trash, or Matrix */}
        {showReport ? (
          <MonthlyReport userId={user?.id || 'local-user'} boardId="default" />
        ) : showTrash ? (
          <TrashViewer onClose={() => setShowTrash(false)} />
        ) : (
          <>
            {/* BEGIN: Matrix Grid */}
            {!loadingTasks && (
              <section className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-6xl">
          {/* QUADRANT 1: DO (Important & Urgent) */}
          <MatrixQuadrant
            title="Do"
            subtitle="Important & Urgent"
            headerColor="bg-do-header"
            icon="fa-solid fa-fire"
            tasks={tasks.urgent_important}
            onAddTask={(text, description) => addTaskToDB('urgent_important', text, description)}
            onDeleteTask={(id) => deleteTaskFromApp('urgent_important', id)}
            onUpdateTask={updateTaskInApp}
            onMoveTask={moveTaskBetweenQuadrants}
            onWellDone={handleWellDone}
            quadrant="urgent_important"
          />

          {/* QUADRANT 2: DECIDE (Important & Not Urgent) */}
          <MatrixQuadrant
            title="Decide"
            subtitle="Important & Not Urgent"
            headerColor="bg-decide-header"
            icon="fa-regular fa-clock"
            tasks={tasks.not_urgent_important}
            onAddTask={(text, description) => addTaskToDB('not_urgent_important', text, description)}
            onDeleteTask={(id) => deleteTaskFromApp('not_urgent_important', id)}
            onUpdateTask={updateTaskInApp}
            onMoveTask={moveTaskBetweenQuadrants}
            onWellDone={handleWellDone}
            quadrant="not_urgent_important"
          />

          {/* QUADRANT 3: DELEGATE (Not Important & Urgent) */}
          <MatrixQuadrant
            title="Delegate"
            subtitle="Not Important & Urgent"
            headerColor="bg-delegate-header"
            icon="fa-solid fa-bullseye"
            tasks={tasks.urgent_not_important}
            onAddTask={(text, description) => addTaskToDB('urgent_not_important', text, description)}
            onDeleteTask={(id) => deleteTaskFromApp('urgent_not_important', id)}
            onUpdateTask={updateTaskInApp}
            onMoveTask={moveTaskBetweenQuadrants}
            onWellDone={handleWellDone}
            quadrant="urgent_not_important"
          />

          {/* QUADRANT 4: DELETE (Not Important & Not Urgent) */}
          <MatrixQuadrant
            title="Delete"
            subtitle="Not Important & Not Urgent"
            headerColor="bg-delete-header"
            icon="fa-solid fa-ban"
            tasks={tasks.not_urgent_not_important}
            onAddTask={(text, description) => addTaskToDB('not_urgent_not_important', text, description)}
            onDeleteTask={(id) => deleteTaskFromApp('not_urgent_not_important', id)}
            onUpdateTask={updateTaskInApp}
            onMoveTask={moveTaskBetweenQuadrants}
            onWellDone={handleWellDone}
            quadrant="not_urgent_not_important"
          />
        </section>
            )}
            {/* END: Matrix Grid */}
          </>
        )}
        {/* END: Matrix Grid */}
      </main>
      {/* END: Main Content */}
    </div>
    </DNDProviderWrapper>
  );
}
