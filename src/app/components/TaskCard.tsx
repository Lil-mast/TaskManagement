import { Trash2 } from 'lucide-react';

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
}

export function TaskCard({ task, onDelete }: TaskCardProps) {
  return (
    <li className="task-item flex items-center justify-between py-1 px-2 hover:bg-black/5 rounded transition-colors group">
      <span className="task-text flex-grow">{task.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
        className="delete-btn opacity-0 group-hover:opacity-100 transition-opacity text-vintage-brown hover:text-red-600 p-1 ml-2"
        aria-label="Delete task"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}
