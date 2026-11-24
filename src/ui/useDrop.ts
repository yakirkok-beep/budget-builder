/** Make an element a drop target. Returns props to spread and whether something is over it. */
import { useState, type DragEvent } from 'react';
import { canDrop, drop, isCopy, type DropTarget } from './transfer';

export function useDrop(target: DropTarget): { over: boolean; props: Record<string, (e: DragEvent<HTMLElement>) => void> } {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e) => {
        if (!canDrop(target)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isCopy(e, target) ? 'copy' : 'move';
        if (!over) setOver(true);
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e) => {
        if (!canDrop(target)) return;
        e.preventDefault();
        setOver(false);
        void drop(target, e);
      },
    },
  };
}
