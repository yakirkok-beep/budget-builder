/** Page dialogs and the toast, rendered once at the app root. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { closeConfirm, useUi } from '../uiStore';

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('[data-autofocus], input, select, button');
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
    return () => prev?.focus?.();
  }, []);
  return (
    <div
      className="modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="box" ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ConfirmHost() {
  const c = useUi((s) => s.confirmState);
  if (!c) return null;
  return (
    <Modal title={c.title} onClose={() => closeConfirm(false)}>
      <p>{c.message}</p>
      <div className="row">
        <button className={`btn primary ${c.danger ? 'danger' : ''}`} data-autofocus onClick={() => closeConfirm(true)}>
          {c.ok ?? 'אישור'}
        </button>
        <button className="btn" onClick={() => closeConfirm(false)}>
          ביטול
        </button>
      </div>
    </Modal>
  );
}

function DialogHost() {
  const d = useUi((s) => s.dialog);
  return d ? <>{d}</> : null;
}

function ToastHost() {
  const t = useUi((s) => s.toastText);
  return (
    <div className="toast" role="status" aria-live="polite" hidden={!t}>
      {t}
    </div>
  );
}

export function Overlays() {
  return (
    <>
      <ConfirmHost />
      <DialogHost />
      <ToastHost />
    </>
  );
}
