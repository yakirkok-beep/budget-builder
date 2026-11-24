/** New event: blank, weekend template, seminar template, or a copy (CLAUDE.md section 8). */
import { useState } from 'react';
import type { EventSource } from '../../domain/templates';
import { budgetStore, useBudgetStore } from '../../store';
import { Modal } from '../components/Overlays';
import { eventHref, navigate } from '../router';
import { closeDialog, toast } from '../uiStore';
import type { BudgetEvent } from '../../domain/types';

const NO_EVENTS: BudgetEvent[] = [];

export function AddEventDialog() {
  const events = useBudgetStore((s) => s.budget?.events ?? NO_EVENTS);
  const [name, setName] = useState('מפעל חדש');
  const [src, setSrc] = useState('blank');

  const create = (): void => {
    const source: EventSource = src.startsWith('copy:')
      ? { kind: 'copy', evId: src.slice(5) }
      : { kind: src as 'blank' | 'weekend' | 'seminar' };
    const id = budgetStore.getState().addEvent(source, name);
    closeDialog();
    navigate(eventHref(id));
    toast('המפעל נוסף');
  };

  return (
    <Modal title="מפעל חדש" onClose={closeDialog}>
      <form
        style={{ display: 'grid', gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label>
          שם המפעל
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          להתחיל מ
          <select value={src} onChange={(e) => setSrc(e.target.value)}>
            <option value="blank">מפעל ריק</option>
            <option value="weekend">תבנית: שבת / סוף שבוע</option>
            <option value="seminar">תבנית: סמינריון עם לינה</option>
            {events.map((e) => (
              <option key={e.id} value={'copy:' + e.id}>
                עותק של: {e.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ fontSize: 12 }}>
          התבניות לקוחות מהתבנית לדוגמה: המבנה והנוסחאות נכונים, והמחירים בשורות הם לדוגמה. עותק של מפעל קיים שומר הכל.
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
