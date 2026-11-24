/** New budget: from the template or as a copy of the open one (CLAUDE.md section 8.7). */
import { useState } from 'react';
import { useBudgetStore } from '../../store';
import { createBudget } from '../actions';
import { Modal } from '../components/Overlays';
import { closeDialog } from '../uiStore';

export function NewBudgetDialog() {
  const year = useBudgetStore((s) => s.budget?.year ?? new Date().getFullYear() + 1);
  const current = useBudgetStore((s) => s.budget?.name ?? '');
  const [name, setName] = useState(`תקציב מחלקת ההדרכה ${year}`);
  const [src, setSrc] = useState<'template' | 'copy'>('template');
  return (
    <Modal title="תקציב חדש" onClose={closeDialog}>
      <form
        style={{ display: 'grid', gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          closeDialog();
          void createBudget(src, name);
        }}
      >
        <label>
          שם
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          להתחיל מ
          <select value={src} onChange={(e) => setSrc(e.target.value as 'template' | 'copy')}>
            <option value="template">התבנית לדוגמה (מספרים לדוגמה בלבד)</option>
            <option value="copy">עותק של התקציב הפתוח ({current})</option>
          </select>
        </label>
        <p className="muted" style={{ fontSize: 12 }}>
          התקציב הפתוח נשמר לפני המעבר. אפשר לחזור אליו מהרשימה בראש העמוד.
        </p>
        <div className="row">
          <button className="btn primary" type="submit">
            יצירה
          </button>
          <button className="btn" type="button" onClick={closeDialog}>
            ביטול
          </button>
        </div>
      </form>
    </Modal>
  );
}
