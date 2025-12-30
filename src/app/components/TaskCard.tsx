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
    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 flex items-start justify-between gap-2 group hover:shadow-md transition-shadow">
      <p className="flex-1 text-gray-800">{task.title}</p>
      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50"
        aria-label="Delete task"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
