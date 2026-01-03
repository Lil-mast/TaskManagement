import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface DNDProviderWrapperProps {
  children: React.ReactNode;
}

export function DNDProviderWrapper({ children }: DNDProviderWrapperProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      {children}
    </DndProvider>
  );
}
