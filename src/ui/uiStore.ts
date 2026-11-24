/**
 * In-page dialogs and toasts (no alert/confirm/prompt, CLAUDE.md section 9).
 */
import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  ok?: string;
  danger?: boolean;
}

interface UiState {
  toastText: string | null;
  confirmState: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  dialog: ReactNode | null;
}

export const useUi = create<UiState>(() => ({ toastText: null, confirmState: null, dialog: null }));

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string): void {
  clearTimeout(toastTimer);
  useUi.setState({ toastText: text });
  toastTimer = setTimeout(() => useUi.setState({ toastText: null }), 3000);
}

/** Ask a yes/no question in a page dialog. Resolves true on OK. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useUi.setState({ confirmState: { ...opts, resolve } }));
}

export function closeConfirm(ok: boolean): void {
  const c = useUi.getState().confirmState;
  useUi.setState({ confirmState: null });
  c?.resolve(ok);
}

/** Show any dialog content (e.g. the new-event form). */
export function openDialog(node: ReactNode): void {
  useUi.setState({ dialog: node });
}

export function closeDialog(): void {
  useUi.setState({ dialog: null });
}
