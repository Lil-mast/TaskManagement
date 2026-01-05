import { useState } from 'react';
import { Trash2, Edit2, Check, X, Star } from 'lucide-react';

export interface Task {
  id: string;
  title: string;
  description?: string;
  quadrant: string;
  user_id: string;
  created_at: string;
}

interface TaskCardProps {
  task: Task;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, title: string, description?: string) => void;
  onWellDone?: (task: Task) => void;
}

export function TaskCard({ task, onDelete, onUpdate, onWellDone }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || '');

  const handleSave = () => {
    if (editTitle.trim() && onUpdate) {
      onUpdate(task.id, editTitle.trim(), editDescription.trim() || undefined);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <li className="task-item p-2 bg-white/50 rounded border border-vintage-beige">
        <div className="space-y-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full p-1 border border-vintage-beige rounded text-vintage-brown font-hand text-xl"
            autoFocus
          />
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Add description (optional)..."
            className="w-full p-1 border border-vintage-beige rounded text-vintage-brown font-hand text-sm resize-none"
            rows={2}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleSave}
              className="p-1 text-green-600 hover:text-green-700 transition-colors"
              aria-label="Save"
            >
              <Check size={16} />
            </button>
            <button
              onClick={handleCancel}
              className="p-1 text-red-600 hover:text-red-700 transition-colors"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="task-item flex items-start justify-between py-1 px-2 hover:bg-black/5 rounded transition-colors group">
      <div className="flex-grow">
        <span className="task-text block font-hand text-xl">{task.title}</span>
        {task.description && (
          <span className="task-description block text-sm text-vintage-brown/70 font-hand mt-1">
            {task.description}
          </span>
        )}
      </div>
      <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onWellDone && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWellDone(task);
            }}
            className="text-vintage-brown hover:text-green-600 p-1 transition-colors"
            aria-label="Mark task as well done"
            title="Well Done!"
          >
            <Star size={14} />
          </button>
        )}
        {onUpdate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="text-vintage-brown hover:text-blue-600 p-1 transition-colors"
            aria-label="Edit task"
          >
            <Edit2 size={14} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="delete-btn text-vintage-brown hover:text-red-600 p-1 transition-colors"
          aria-label="Delete task"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}
