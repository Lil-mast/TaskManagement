import { CompletedTask, TrashManager } from '../../lib/trashManager';

interface TrashViewerProps {
  onClose: () => void;
}

export function TrashViewer({ onClose }: TrashViewerProps) {
  const trashTasks = TrashManager.getTrash();

  return (
    <div className="w-full max-w-4xl">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-vintage-brown">Completed Tasks</h2>
          <button
            onClick={onClose}
            className="text-vintage-brown hover:text-red-600 transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-2">
          {trashTasks.length === 0 ? (
            <p className="text-vintage-brown/70 text-center py-8">
              No completed tasks yet. Use the star button to mark tasks as done!
            </p>
          ) : (
            trashTasks.map((task: CompletedTask) => (
              <div 
                key={task.id} 
                className="bg-vintage-cream p-3 rounded border border-vintage-beige hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-bold text-vintage-brown">{task.title}</h3>
                    {task.description && (
                      <p className="text-sm text-vintage-brown/70 mt-1">{task.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-vintage-brown/50">
                      <span>Completed: {new Date(task.completed_at).toLocaleDateString()}</span>
                      <span className="px-2 py-1 bg-vintage-brown/20 rounded">
                        {task.quadrant.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {task.motivation_quote && (
                      <p className="text-xs text-green-600 mt-2 italic">"{task.motivation_quote}"</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {trashTasks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-vintage-beige">
            <p className="text-sm text-vintage-brown/50">
              Total completed: {trashTasks.length} tasks
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
