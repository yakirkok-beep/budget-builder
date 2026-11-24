/** Shown when the browser refuses clipboard access: the text, selected, to copy by hand. */
import { useEffect, useRef } from 'react';
import { Modal } from './Overlays';
import { closeDialog } from '../uiStore';

export function ManualCopy({ text }: { text: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <Modal title="העתקה ידנית" onClose={closeDialog}>
      <p className="muted">הדפדפן לא אישר העתקה אוטומטית. הטקסט מסומן: Ctrl+C להעתקה.</p>
      <textarea ref={ref} readOnly value={text} dir="ltr" style={{ width: '100%', height: 200 }} aria-label="הטקסט להעתקה" />
      <div className="row">
        <button className="btn" onClick={closeDialog}>
          סגירה
        </button>
      </div>
    </Modal>
  );
}
