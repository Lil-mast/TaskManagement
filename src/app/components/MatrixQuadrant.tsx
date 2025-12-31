import { useState } from 'react';
import { TaskCard, type Task } from './TaskCard';

interface MatrixQuadrantProps {
  title: string;
  subtitle: string;
  headerColor: string;
  icon: string;
  tasks: Task[];
  onAddTask: (text: string) => void;
  onDeleteTask: (id: string) => void;
}

export function MatrixQuadrant({
  title,
  subtitle,
  headerColor,
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
    <article className="matrix-card h-80 relative">
      <div className="matrix-card-border-effect"></div>
      {/* Card Header */}
      <div className={`card-header ${headerColor} p-4 flex items-center space-x-4`}>
        <div className="icon-wrapper">
          <i className={`${icon} icon-style`}></i>
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-vintage-brown leading-none">{title}</h2>
          <span className="text-xs font-bold text-vintage-brown uppercase tracking-wider opacity-70">{subtitle}</span>
        </div>
      </div>
      {/* Card Body */}
      <div className="lined-paper flex-grow p-4 overflow-y-auto custom-scroll font-hand text-2xl text-vintage-brown">
        <ul className="list-none space-y-0">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onDelete={onDeleteTask} />
          ))}
        </ul>
      </div>
      {/* Card Footer */}
      <div className="p-3 bg-parchment/30">
        {isAdding ? (
          <form onSubmit={handleSubmit} className="space-y-2">
            <input
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="Enter task description..."
              className="w-full p-2 border border-card-border rounded bg-parchment text-vintage-brown font-hand text-xl"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-card-border text-parchment rounded hover:bg-vintage-brown transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 text-vintage-brown rounded hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="add-task-box w-full py-2 text-center text-vintage-brown font-hand text-xl hover:bg-black/5 transition-colors cursor-pointer"
            onClick={() => setIsAdding(true)}
          >
            + Add Task
          </button>
        )}
      </div>
    </article>
  );
}
