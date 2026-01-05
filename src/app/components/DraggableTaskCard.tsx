import { useDrag, useDrop } from 'react-dnd';
import { TaskCard } from './TaskCard';
import type { Task } from './TaskCard';

interface DraggableTaskCardProps {
  task: Task;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, title: string, description?: string) => void;
  onWellDone?: (task: Task) => void;
  onMove?: (taskId: string, targetQuadrant: string) => void;
  currentQuadrant: string;
}

export const TASK_TYPE = 'task';

export function DraggableTaskCard({ 
  task, 
  onDelete, 
  onUpdate, 
  onWellDone,
  onMove, 
  currentQuadrant 
}: DraggableTaskCardProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: TASK_TYPE,
    item: { id: task.id, currentQuadrant },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: TASK_TYPE,
    drop: (item: { id: string; currentQuadrant: string }) => {
      if (item.id !== task.id && onMove && item.currentQuadrant !== currentQuadrant) {
        onMove(item.id, currentQuadrant);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  return (
    <div
      ref={(node) => {
        if (node) {
          drag(drop(node));
        }
      }}
      style={{
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isOver && canDrop ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        borderRadius: '4px',
        transition: 'background-color 0.2s',
      }}
    >
      <TaskCard task={task} onDelete={onDelete} onUpdate={onUpdate} onWellDone={onWellDone} />
    </div>
  );
}
