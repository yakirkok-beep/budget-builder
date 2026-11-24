/**
 * Expense lines grouped by category, with a subtotal and "+ שורה" per group.
 * All rows sit in one flat <tbody> with stable keys, so moving a line to another
 * category moves its DOM row instead of recreating it (focus is kept).
 */
import { useState, type ReactNode } from 'react';
import type { BudgetEvent, EventResult, ExpenseLine } from '../../../domain/types';
import { budgetStore } from '../../../store';
import { fmt } from '../../format';
import { FxInput, TextInput } from '../../components/inputs';

const act = () => budgetStore.getState();
const COLS = 8;

function CategorySelect({ ev, line, names }: { ev: BudgetEvent; line: ExpenseLine; names: string[] }) {
  const ok = names.includes(line.cat);
  return (
    <select
      className={`cell ${ok ? '' : 'err'}`}
      value={line.cat}
      aria-label={'קטגוריה של ' + (line.item || 'שורה')}
      onChange={(e) => act().setLineField(ev.id, line.id, 'cat', e.target.value)}
    >
      {!ok && <option value={line.cat}>{line.cat ? `${line.cat} (לא קיימת)` : 'ללא קטגוריה'}</option>}
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

export function LinesCard({ ev, E }: { ev: BudgetEvent; E: EventResult }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const names = ev.cats.filter((c) => !c.blat).map((c) => c.name);
  const groups: { name: string | null; lines: ExpenseLine[] }[] = names.map((n) => ({ name: n, lines: ev.lines.filter((l) => l.cat === n) }));
  const orphans = ev.lines.filter((l) => !names.includes(l.cat));
  if (orphans.length) groups.push({ name: null, lines: orphans });

  const addLine = (cat?: string): void => setFocusId(act().addLine(ev.id, cat));

  const rows: ReactNode[] = [];
  for (const g of groups) {
    const sum = g.lines.reduce((s, l) => s + (E.lines[l.id]?.t ?? 0), 0);
    rows.push(
      <tr className="grp" key={'g:' + (g.name ?? '')}>
        <td colSpan={COLS}>
          {g.name !== null ? <span className="gname">{g.name}</span> : <span className="gname err">שורות בלי קטגוריה תקינה</span>}
          <span className="gsum">{fmt(sum)}</span>
        </td>
      </tr>,
    );
    for (const l of g.lines) {
      const L = E.lines[l.id];
      rows.push(
        <tr key={l.id}>
          <td style={{ width: '13%' }}>
            <CategorySelect ev={ev} line={l} names={names} />
          </td>
          <td className="item" style={{ width: '24%' }}>
            <TextInput value={l.item} label="פריט" autoFocus={l.id === focusId} onChange={(v) => act().setLineField(ev.id, l.id, 'item', v)} />
          </td>
          <td style={{ width: '11%' }}>
            <FxInput value={l.qty} label={'כמות ' + l.item} result={L?.q} onChange={(v) => act().setLineField(ev.id, l.id, 'qty', v)} />
          </td>
          <td style={{ width: '9%' }}>
            <FxInput value={l.days} label={'ימים או פעמים ' + l.item} result={L?.d} onChange={(v) => act().setLineField(ev.id, l.id, 'days', v)} />
          </td>
          <td style={{ width: '12%' }}>
            <FxInput value={l.price} label={'מחיר ליחידה ' + l.item} result={L?.p} onChange={(v) => act().setLineField(ev.id, l.id, 'price', v)} />
          </td>
          <td className={`n ${L?.err ? 'err' : ''}`} style={{ width: '10%' }} title={L?.err ?? undefined}>
            {L?.err ? '⚠' : fmt(L?.t)}
          </td>
          <td>
            <TextInput value={l.note} label="הערה" onChange={(v) => act().setLineField(ev.id, l.id, 'note', v)} />
          </td>
          <td>
            <button className="iconbtn" aria-label={'מחיקת השורה ' + (l.item || '')} onClick={() => act().deleteLine(ev.id, l.id)}>
              ×
            </button>
          </td>
        </tr>,
      );
    }
    if (g.name !== null) {
      const cat = g.name;
      rows.push(
        <tr key={'add:' + cat}>
          <td colSpan={COLS}>
            <button className="btn small ghost" onClick={() => addLine(cat)}>
              + שורה ב{cat}
            </button>
          </td>
        </tr>,
      );
    }
  }

  return (
    <section className="card" aria-labelledby={`lines-${ev.id}`}>
      <h3 id={`lines-${ev.id}`}>
        שורות הוצאה <span className="hint">סה"כ = כמות × ימים × מחיר × (1 + התייקרות). ימים ריק = 1.</span>
      </h3>
      <div className="scroll">
        <table className="lines-table">
          <thead>
            <tr>
              <th>קטגוריה</th>
              <th>פריט</th>
              <th className="n">כמות</th>
              <th className="n">ימים / פעמים</th>
              <th className="n">מחיר ליחידה ₪</th>
              <th className="n">סה"כ ₪</th>
              <th>הערה</th>
              <th>
                <span className="sr-only">מחיקה</span>
              </th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
      <div className="addrow">
        <button className="btn small" onClick={() => addLine()}>
          + שורה
        </button>
      </div>
    </section>
  );
}
