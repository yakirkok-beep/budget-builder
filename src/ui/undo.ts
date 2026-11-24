/**
 * Undo/redo from anywhere: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z (Cmd on Mac).
 * Matches the physical key (e.code), so it also works with a Hebrew keyboard layout.
 * If a field is focused it is blurred first (a pending rename is applied, fields re-sync),
 * then focused again.
 */
import { useEffect } from 'react';
import { budgetStore } from '../store';

export function undoRedo(kind: 'undo' | 'redo'): boolean {
  const el = document.activeElement as HTMLElement | null;
  const inField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  if (inField) el.blur();
  const done = kind === 'undo' ? budgetStore.getState().undo() : budgetStore.getState().redo();
  if (inField) requestAnimationFrame(() => el.isConnected && el.focus());
  return done;
}

export function useUndoKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const undo = e.code === 'KeyZ' && !e.shiftKey;
      const redo = e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey);
      if (!undo && !redo) return;
      // dialogs keep the browser's own undo for their text fields
      if ((e.target as HTMLElement | null)?.closest?.('.modal')) return;
      e.preventDefault();
      undoRedo(undo ? 'undo' : 'redo');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
