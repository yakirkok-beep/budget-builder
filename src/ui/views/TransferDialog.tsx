/** Move or copy lines, income lines, params or a whole category to another event. */
import { useState } from 'react';
import type { BudgetEvent } from '../../domain/types';
import { useBudgetStore } from '../../store';
import { Modal } from '../components/Overlays';
import { closeDialog } from '../uiStore';

export type TransferWhat =
  | { kind: 'lines'; evId: string; ids: string[] }
  | { kind: 'income'; evId: string; ids: string[] }
  | { kind: 'params'; evId: string; ids: string[] }
  | { kind: 'category'; evId: string; catId: string };

const NO_EVENTS: BudgetEvent[] = [];

function title(what: TransferWhat): string {
  const n = 'ids' in what ? what.ids.length : 1;
  switch (what.kind) {
    case 'lines':
      return n === 1 ? 'העברה או העתקה של שורה' : `העברה או העתקה של ${n} שורות`;
    case 'income':
      return n === 1 ? 'העברה או העתקה של שורת הכנסה' : `העברה או העתקה של ${n} שורות הכנסה`;
    case 'params':
      return n === 1 ? 'העתקת פרמטר למפעל אחר' : `העתקת ${n} פרמטרים למפעל אחר`;
    case 'category':
      return 'העברה או העתקה של קטגוריה';
  }
}

export function TransferDialog({ what, onGo }: { what: TransferWhat; onGo(toEvId: string, copy: boolean, cat?: string): void }) {
  const events = useBudgetStore((s) => s.budget?.events ?? NO_EVENTS);
  const others = events.filter((e) => e.id !== what.evId);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [cat, setCat] = useState('');
  const target = others.find((e) => e.id === to);
  const go = (copy: boolean): void => {
    if (!to) return;
    closeDialog();
    onGo(to, copy, what.kind === 'lines' && cat ? cat : undefined);
  };

  return (
    <Modal title={title(what)} onClose={closeDialog}>
      {others.length === 0 ? (
        <p className="muted">אין עוד מפעלים בתקציב הזה.</p>
      ) : (
        <>
          <label>
            אל המפעל
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {others.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          {what.kind === 'lines' && target && (
            <label>
              לקטגוריה
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">כמו במקור (נוצרת אם חסרה)</option>
                {target.cats
                  .filter((c) => !c.blat)
                  .map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <p className="muted" style={{ fontSize: 12.5 }}>
            פרמטרים, פריטי מחירון ושורות שכר שהנוסחאות צריכות ועוד לא קיימים שם, נוספים אוטומטית.
            {what.kind === 'params' ? ' פרמטרים תמיד מועתקים, כדי לא לשבור נוסחאות במפעל הזה.' : ''}
          </p>
        </>
      )}
      <div className="row">
        {others.length > 0 && (
          <button className="btn primary" onClick={() => go(true)}>
            העתקה
          </button>
        )}
        {others.length > 0 && what.kind !== 'params' && (
          <button className="btn" onClick={() => go(false)}>
            העברה
          </button>
        )}
        <button className="btn ghost" onClick={closeDialog}>
          ביטול
        </button>
      </div>
    </Modal>
  );
}
