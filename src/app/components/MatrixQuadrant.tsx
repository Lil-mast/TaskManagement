import { useState } from 'react';
import { useDrop } from 'react-dnd';
import { DraggableTaskCard, TASK_TYPE } from './DraggableTaskCard';
import type { Task } from './TaskCard';

interface MatrixQuadrantProps {
  title: string;
  subtitle: string;
  headerColor: string;
  icon: string;
  tasks: Task[];
  onAddTask: (text: string, description?: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask?: (id: string, title: string, description?: string) => void;
  onMoveTask?: (taskId: string, fromQuadrant: string, toQuadrant: string) => void;
  onWellDone?: (task: Task) => void;
  quadrant: string;
}

export function MatrixQuadrant({
  title,
  subtitle,
  headerColor,
  icon,
  tasks,
  onAddTask,
  onDeleteTask,
  onUpdateTask,
  onMoveTask,
  onWellDone,
  quadrant,
}: MatrixQuadrantProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: TASK_TYPE,
    drop: (item: { id: string; currentQuadrant: string }) => {
      if (item.currentQuadrant !== quadrant && onMoveTask) {
        onMoveTask(item.id, item.currentQuadrant, quadrant);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const dropRef = drop;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskText.trim()) {
      onAddTask(newTaskText.trim(), newTaskDescription.trim() || undefined);
      setNewTaskText('');
      setNewTaskDescription('');
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setNewTaskText('');
    setNewTaskDescription('');
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
      <div 
        ref={dropRef as any}
        className={`lined-paper flex-grow p-4 overflow-y-auto custom-scroll font-hand text-2xl text-vintage-brown ${
          isOver && canDrop ? 'bg-blue-50 border-2 border-blue-300' : ''
        }`}
      >
        <ul className="list-none space-y-0">
          {tasks.map((task) => (
            <DraggableTaskCard 
              key={task.id} 
              task={task} 
              onDelete={onDeleteTask}
              onUpdate={onUpdateTask}
              onWellDone={onWellDone}
              onMove={onMoveTask ? (taskId, targetQuadrant) => onMoveTask(taskId, quadrant, targetQuadrant) : undefined}
              currentQuadrant={quadrant}
            />
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
            <textarea
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              placeholder="Add description (optional)..."
              className="w-full p-2 border border-card-border rounded bg-parchment text-vintage-brown font-hand text-sm resize-none"
              rows={2}
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
