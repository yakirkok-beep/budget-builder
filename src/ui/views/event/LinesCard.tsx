/**
 * Expense lines grouped by category, with a subtotal and "+ שורה" per group.
 * All rows sit in one flat <tbody> with stable keys, so moving a line to another
 * category moves its DOM row instead of recreating it (focus is kept).
 *
 * Copy / move: a checkbox selects lines (and a group checkbox selects a whole category),
 * a grip drags them (onto a line or a category header: move, with Ctrl: copy; onto another
 * event in the sidebar: copy), and the "⋯" menu duplicates, copies or moves them.
 */
import { useState, type ReactNode } from 'react';
import type { BudgetEvent, EventResult, ExpenseLine } from '../../../domain/types';
import { budgetStore } from '../../../store';
import { fmt } from '../../format';
import { DragHandle } from '../../components/DragHandle';
import { FxInput, TextInput } from '../../components/inputs';
import { RowMenu } from '../../components/RowMenu';
import { copyLines, openTransfer, pasteClip, useClip } from '../../transfer';
import { useDrop } from '../../useDrop';

const act = () => budgetStore.getState();
const COLS = 9;

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

interface RowProps {
  ev: BudgetEvent;
  E: EventResult;
  line: ExpenseLine;
  names: string[];
  focusId: string | null;
  selected: boolean;
  dragIds: string[];
  onSelect(on: boolean): void;
}

function LineRow({ ev, E, line: l, names, focusId, selected, dragIds, onSelect }: RowProps) {
  const L = E.lines[l.id];
  const drop = useDrop({ kind: 'line', evId: ev.id, lineId: l.id, cat: l.cat });
  const name = l.item || 'שורה';
  return (
    <tr className={`${selected ? 'is-selected' : ''} ${drop.over ? 'drop-before' : ''}`} {...drop.props}>
      <td className="grip">
        <input type="checkbox" checked={selected} aria-label={'בחירת ' + name} onChange={(e) => onSelect(e.target.checked)} />
        <DragHandle payload={{ kind: 'lines', evId: ev.id, ids: dragIds }} label={'גרירת ' + name} />
      </td>
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
      <td className="row-actions">
        <RowMenu
          label={'פעולות על ' + name}
          items={[
            { label: 'שכפול', onSelect: () => act().duplicateLines(ev.id, [l.id]) },
            { label: 'העתקה', onSelect: () => copyLines(ev.id, [l.id]) },
            { label: 'העברה או העתקה למפעל אחר...', onSelect: () => openTransfer({ kind: 'lines', evId: ev.id, ids: [l.id] }) },
            { label: 'מחיקה', danger: true, onSelect: () => act().deleteLine(ev.id, l.id) },
          ]}
        />
        <button className="iconbtn" aria-label={'מחיקת השורה ' + (l.item || '')} onClick={() => act().deleteLine(ev.id, l.id)}>
          ×
        </button>
      </td>
    </tr>
  );
}

function GroupRow({ ev, cat, lines, sum, sel, setSel }: { ev: BudgetEvent; cat: string | null; lines: ExpenseLine[]; sum: number; sel: string[]; setSel(ids: string[]): void }) {
  const drop = useDrop({ kind: 'group', evId: ev.id, cat: cat ?? '' });
  const clip = useClip((s) => s.clip);
  const ids = lines.map((l) => l.id);
  const all = ids.length > 0 && ids.every((id) => sel.includes(id));
  return (
    <tr className={`grp ${drop.over ? 'drop-into' : ''}`} {...drop.props}>
      <td className="grip">
        {ids.length > 0 && (
          <input
            type="checkbox"
            checked={all}
            aria-label={'בחירת כל השורות ב' + (cat ?? 'ללא קטגוריה')}
            onChange={(e) => setSel(e.target.checked ? [...new Set([...sel, ...ids])] : sel.filter((id) => !ids.includes(id)))}
          />
        )}
      </td>
      <td colSpan={COLS - 1}>
        {cat !== null ? <span className="gname">{cat}</span> : <span className="gname err">שורות בלי קטגוריה תקינה</span>}
        {clip?.kind === 'lines' && cat !== null && (
          <button className="btn small ghost paste-here" onClick={() => void pasteClip({ kind: 'event', evId: ev.id, cat })}>
            הדבקה כאן
          </button>
        )}
        <span className="gsum">{fmt(sum)}</span>
      </td>
    </tr>
  );
}

function SelectionBar({ ev, sel, clear }: { ev: BudgetEvent; sel: string[]; clear(): void }) {
  const n = sel.length;
  return (
    <div className="selbar" role="toolbar" aria-label="פעולות על השורות שנבחרו" data-testid="selbar">
      <strong>{n === 1 ? 'שורה אחת נבחרה' : `${n} שורות נבחרו`}</strong>
      <button className="btn small" onClick={() => act().duplicateLines(ev.id, sel)}>
        שכפול
      </button>
      <button className="btn small" onClick={() => copyLines(ev.id, sel)}>
        העתקה
      </button>
      <button className="btn small" onClick={() => openTransfer({ kind: 'lines', evId: ev.id, ids: sel })}>
        העברה או העתקה למפעל אחר...
      </button>
      <button
        className="btn small danger"
        onClick={() => {
          act().deleteLines(ev.id, sel);
          clear();
        }}
      >
        מחיקה
      </button>
      <button className="btn small ghost" onClick={clear}>
        ביטול הבחירה
      </button>
    </div>
  );
}

export function LinesCard({ ev, E }: { ev: BudgetEvent; E: EventResult }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [rawSel, setSel] = useState<string[]>([]);
  const clip = useClip((s) => s.clip);
  const sel = rawSel.filter((id) => ev.lines.some((l) => l.id === id)); // drop lines that were deleted or moved away
  const names = ev.cats.filter((c) => !c.blat).map((c) => c.name);
  const groups: { name: string | null; lines: ExpenseLine[] }[] = names.map((n) => ({ name: n, lines: ev.lines.filter((l) => l.cat === n) }));
  const orphans = ev.lines.filter((l) => !names.includes(l.cat));
  if (orphans.length) groups.push({ name: null, lines: orphans });

  const addLine = (cat?: string): void => setFocusId(act().addLine(ev.id, cat));

  const rows: ReactNode[] = [];
  for (const g of groups) {
    const sum = g.lines.reduce((s, l) => s + (E.lines[l.id]?.t ?? 0), 0);
    rows.push(<GroupRow key={'g:' + (g.name ?? '')} ev={ev} cat={g.name} lines={g.lines} sum={sum} sel={sel} setSel={setSel} />);
    for (const l of g.lines) {
      const selected = sel.includes(l.id);
      rows.push(
        <LineRow
          key={l.id}
          ev={ev}
          E={E}
          line={l}
          names={names}
          focusId={focusId}
          selected={selected}
          dragIds={selected ? sel : [l.id]}
          onSelect={(on) => setSel(on ? [...sel, l.id] : sel.filter((id) => id !== l.id))}
        />,
      );
    }
    if (g.name !== null) {
      const cat = g.name;
      rows.push(
        <tr key={'add:' + cat}>
          <td />
          <td colSpan={COLS - 1}>
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
      {sel.length > 0 && <SelectionBar ev={ev} sel={sel} clear={() => setSel([])} />}
      <div className="scroll">
        <table className="lines-table">
          <thead>
            <tr>
              <th>
                <span className="sr-only">בחירה וגרירה</span>
              </th>
              <th>קטגוריה</th>
              <th>פריט</th>
              <th className="n">כמות</th>
              <th className="n">ימים / פעמים</th>
              <th className="n">מחיר ליחידה ₪</th>
              <th className="n">סה"כ ₪</th>
              <th>הערה</th>
              <th>
                <span className="sr-only">פעולות</span>
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
        {clip?.kind === 'lines' && (
          <button className="btn small primary" onClick={() => void pasteClip({ kind: 'event', evId: ev.id })}>
            הדבקת השורות (כל שורה לקטגוריה שלה)
          </button>
        )}
        {clip?.kind === 'category' && (
          <button className="btn small primary" onClick={() => void pasteClip({ kind: 'event', evId: ev.id })}>
            הדבקת הקטגוריה "{clip.cat.name}"
          </button>
        )}
      </div>
    </section>
  );
}
