/** Side panel: Priority categories with codes and periods, 2026 comparison, and the event totals. */
import type { BudgetEvent, Category, EventResult } from '../../../domain/types';
import { linesInCategory } from '../../../domain/edit';
import { budgetStore } from '../../../store';
import { fmt, fmtPct } from '../../format';
import { DragHandle } from '../../components/DragHandle';
import { KeyInput, PeriodSelect, TextInput } from '../../components/inputs';
import { RowMenu } from '../../components/RowMenu';
import { copyCategory, openTransfer, pasteClip, useClip } from '../../transfer';
import { useDrop } from '../../useDrop';
import { confirmDialog } from '../../uiStore';

const act = () => budgetStore.getState();

async function deleteCategory(ev: BudgetEvent, catId: string, name: string): Promise<void> {
  const b = act().budget;
  const n = b ? linesInCategory(b, ev.id, catId) : 0;
  if (n > 0) {
    const ok = await confirmDialog({
      title: 'מחיקת קטגוריה',
      message: `בקטגוריה "${name}" יש ${n === 1 ? 'שורה אחת' : n + ' שורות'}. למחוק את הקטגוריה? השורות יישארו ויסומנו "ללא קטגוריה".`,
      ok: 'מחיקה',
      danger: true,
    });
    if (!ok) return;
  }
  act().deleteCategory(ev.id, catId);
}

/** A category row. Lines dropped on it move into it; a dragged category is reordered before it. */
function CategoryRow({ ev, E, c }: { ev: BudgetEvent; E: EventResult; c: Category }) {
  const drop = useDrop({ kind: 'catRow', evId: ev.id, catId: c.id, cat: c.name, blat: c.blat });
  return (
    <tr className={drop.over ? 'drop-before' : ''} {...drop.props}>
      <td className="grip">
        <DragHandle payload={{ kind: 'category', evId: ev.id, catId: c.id }} label={'גרירת הקטגוריה ' + c.name} />
      </td>
      <td>
        <KeyInput value={c.name} label="שם קטגוריה" onCommit={(n) => act().renameCategory(ev.id, c.id, n)} />
        {c.blat && <span className="out" style={{ textAlign: 'start' }}>מחושב: {fmtPct(E.pct)} מהשאר</span>}
      </td>
      <td className="code" style={{ width: '26%' }}>
        <TextInput value={c.code} label={'קוד פריוריטי ל' + c.name} placeholder="קוד" onChange={(v) => act().setCategoryField(ev.id, c.id, 'code', v)} />
      </td>
      <td style={{ width: '20%' }}>
        <PeriodSelect value={c.period} onChange={(v) => act().setCategoryField(ev.id, c.id, 'period', v)} />
      </td>
      <td className="n" data-testid={`cat-${c.name}`}>{fmt(E.cats[c.id])}</td>
      <td className="n muted">{c.plan != null ? fmt(c.plan) : ''}</td>
      <td className="n muted">{c.act != null ? fmt(c.act) : ''}</td>
      <td className="row-actions">
        <RowMenu
          label={'פעולות על הקטגוריה ' + c.name}
          items={[
            { label: 'שכפול עם השורות', hidden: c.blat, onSelect: () => act().duplicateCategory(ev.id, c.id) },
            { label: c.blat ? 'העתקה' : 'העתקה עם השורות', onSelect: () => copyCategory(ev.id, c.id) },
            { label: 'העברה או העתקה למפעל אחר...', onSelect: () => openTransfer({ kind: 'category', evId: ev.id, catId: c.id }) },
            { label: 'מחיקה', danger: true, onSelect: () => void deleteCategory(ev, c.id, c.name) },
          ]}
        />
        <button className="iconbtn" aria-label={'מחיקת הקטגוריה ' + c.name} onClick={() => void deleteCategory(ev, c.id, c.name)}>
          ×
        </button>
      </td>
    </tr>
  );
}

export function CategoriesCard({ ev, E }: { ev: BudgetEvent; E: EventResult }) {
  const clip = useClip((s) => s.clip);
  const hasBlat = ev.cats.some((c) => c.blat);
  const def26 = E.plan26 ? E.plan26 - E.incPlan26 : null;
  return (
    <section className="card" aria-labelledby={`cats-${ev.id}`}>
      <h3 id={`cats-${ev.id}`}>לפי סעיפי פריוריטי</h3>
      <div className="scroll">
        <table className="cattab">
          <thead>
            <tr>
              <th>
                <span className="sr-only">גרירה</span>
              </th>
              <th>קטגוריה</th>
              <th>קוד</th>
              <th title="חודש 1-12">תקופה</th>
              <th className="n">2027</th>
              <th className="n">תכנון 26</th>
              <th className="n">ניצול 26</th>
              <th>
                <span className="sr-only">פעולות</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ev.cats.map((c) => (
              <CategoryRow key={c.id} ev={ev} E={E} c={c} />
            ))}
            {E.unassigned !== 0 && (
              <tr>
                <td />
                <td className="err">ללא קטגוריה</td>
                <td />
                <td />
                <td className="n err">{fmt(E.unassigned)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="addrow">
        <button className="btn small" onClick={() => act().addCategory(ev.id)}>
          + קטגוריה
        </button>
        {!hasBlat && (
          <button className="btn small" onClick={() => act().addBlatCategory(ev.id)}>
            + בלת"ם מחושב
          </button>
        )}
        {clip?.kind === 'category' && (
          <button className="btn small primary" onClick={() => void pasteClip({ kind: 'event', evId: ev.id })}>
            הדבקת הקטגוריה "{clip.cat.name}"
          </button>
        )}
      </div>

      <div className="totals" data-testid="event-totals">
        <span>סה"כ הוצאות</span>
        <span className="n" data-testid="event-exp">{fmt(E.exp)}</span>
        <span>סה"כ הכנסות</span>
        <span className="n" data-testid="event-inc">{fmt(E.inc)}</span>
        <div className="rule" />
        <span className="big">גירעון</span>
        <span className={`big n ${E.def > 0.5 ? 'neg' : ''}`}>{fmt(E.def)}</span>
        <span className="muted">משתתפים</span>
        <span className="n muted">{E.part != null ? fmt(E.part) : '-'}</span>
        <span className="muted">עלות לנפש</span>
        <span className="n muted">{E.perHead != null ? fmt(E.perHead) : '-'}</span>
        <span className="muted">סבסוד לנפש</span>
        <span className="n muted">{E.subsidyPerHead != null ? fmt(E.subsidyPerHead) : '-'}</span>
        <span className="muted">גירעון תכנון 2026</span>
        <span className="n muted">{def26 != null ? fmt(def26) : '-'}</span>
      </div>

      {E.issues.length > 0 && (
        <ul className="issues" style={{ marginTop: 10 }} aria-label="לבדיקה">
          {E.issues.map((i) => (
            <li key={i.kind} className="err">
              {i.msg}
            </li>
          ))}
        </ul>
      )}
      {ev.notes.map((n, k) => (
        <p className="note" key={k}>
          {n}
        </p>
      ))}
    </section>
  );
}
