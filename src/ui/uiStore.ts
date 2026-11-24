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

export interface Choice<T extends string> {
  value: T;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

export interface ChoiceOptions<T extends string> {
  title: string;
  message: ReactNode;
  choices: Choice<T>[];
}

interface UiState {
  toastText: string | null;
  confirmState: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  choiceState: (ChoiceOptions<string> & { resolve: (v: string | null) => void }) | null;
  dialog: ReactNode | null;
}

export const useUi = create<UiState>(() => ({ toastText: null, confirmState: null, choiceState: null, dialog: null }));

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** A short message at the bottom. Longer messages stay a bit longer. */
export function toast(text: string): void {
  clearTimeout(toastTimer);
  useUi.setState({ toastText: text });
  toastTimer = setTimeout(() => useUi.setState({ toastText: null }), text.length > 60 ? 5500 : 3000);
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

/** Ask with several answers (e.g. overwrite / skip). Resolves with the chosen value, or null on cancel. */
export function choiceDialog<T extends string>(opts: ChoiceOptions<T>): Promise<T | null> {
  return new Promise((resolve) =>
    useUi.setState({ choiceState: { ...(opts as ChoiceOptions<string>), resolve: resolve as (v: string | null) => void } }),
  );
}

export function closeChoice(value: string | null): void {
  const c = useUi.getState().choiceState;
  useUi.setState({ choiceState: null });
  c?.resolve(value);
}

/** Show any dialog content (e.g. the new-event form). */
export function openDialog(node: ReactNode): void {
  useUi.setState({ dialog: node });
}

export function closeDialog(): void {
  useUi.setState({ dialog: null });
}
