import { Plus } from 'lucide-react';
import { useState } from 'react';
import { TaskCard, type Task } from './TaskCard';

interface MatrixQuadrantProps {
  title: string;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
  tasks: Task[];
  onAddTask: (text: string) => void;
  onDeleteTask: (id: string) => void;
}

export function MatrixQuadrant({
  title,
  subtitle,
  color,
  icon,
  tasks,
  onAddTask,
  onDeleteTask,
}: MatrixQuadrantProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskText.trim()) {
      onAddTask(newTaskText.trim());
      setNewTaskText('');
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setNewTaskText('');
    setIsAdding(false);
  };

  return (
    <div className="bg-gray-50 rounded-xl p-5 flex flex-col h-full border-2" style={{ borderColor: color }}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <div style={{ color }}>{icon}</div>
          <h3 className="text-gray-900">{title}</h3>
        </div>
        <p className="text-gray-600 text-sm">{subtitle}</p>
      </div>

      {/* Task List */}
      <div className="flex-1 space-y-2 mb-4 overflow-y-auto">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onDelete={onDeleteTask} />
        ))}
        {tasks.length === 0 && !isAdding && (
          <p className="text-gray-400 text-sm text-center py-8">No tasks yet</p>
        )}
      </div>

      {/* Add Task Form */}
      {isAdding ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            placeholder="Enter task description..."
            className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 resize-none"
            style={{ focusRingColor: color }}
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: color }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-3 border-2 border-dashed rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900"
          style={{ borderColor: color }}
        >
          <Plus size={20} />
          Add Task
        </button>
      )}
    </div>
  );
}
