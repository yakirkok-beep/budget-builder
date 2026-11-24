import type { BudgetEvent, EventResult, IncomeLine } from '../../../domain/types';
import { budgetStore } from '../../../store';
import { fmt } from '../../format';
import { DragHandle } from '../../components/DragHandle';
import { FxInput, TextInput } from '../../components/inputs';
import { RowMenu } from '../../components/RowMenu';
import { copyIncome, openTransfer, pasteClip, useClip } from '../../transfer';
import { useDrop } from '../../useDrop';

const act = () => budgetStore.getState();

function IncomeRow({ ev, E, i }: { ev: BudgetEvent; E: EventResult; i: IncomeLine }) {
  const I = E.income[i.id];
  const drop = useDrop({ kind: 'income', evId: ev.id, id: i.id });
  const name = i.label || 'שורת הכנסה';
  return (
    <tr className={drop.over ? 'drop-before' : ''} {...drop.props}>
      <td className="grip">
        <DragHandle payload={{ kind: 'income', evId: ev.id, ids: [i.id] }} label={'גרירת ' + name} />
      </td>
      <td>
        <TextInput value={i.label} label="מקור הכנסה" onChange={(v) => act().setIncomeField(ev.id, i.id, 'label', v)} />
      </td>
      <td style={{ width: '18%' }}>
        <FxInput value={i.qty} label={'משלמים ' + i.label} result={I?.q} onChange={(v) => act().setIncomeField(ev.id, i.id, 'qty', v)} />
      </td>
      <td style={{ width: '16%' }}>
        <FxInput value={i.price} label={'מחיר ' + i.label} result={I?.p} onChange={(v) => act().setIncomeField(ev.id, i.id, 'price', v)} />
      </td>
      <td className={`n ${I?.err ? 'err' : ''}`}>{I?.err ? '⚠' : fmt(I?.t)}</td>
      <td>
        <TextInput value={i.note} label="הערה" onChange={(v) => act().setIncomeField(ev.id, i.id, 'note', v)} />
      </td>
      <td className="row-actions">
        <RowMenu
          label={'פעולות על ' + name}
          items={[
            { label: 'שכפול', onSelect: () => act().duplicateIncome(ev.id, i.id) },
            { label: 'העתקה', onSelect: () => copyIncome(ev.id, [i.id]) },
            { label: 'העברה או העתקה למפעל אחר...', onSelect: () => openTransfer({ kind: 'income', evId: ev.id, ids: [i.id] }) },
            { label: 'מחיקה', danger: true, onSelect: () => act().deleteIncome(ev.id, i.id) },
          ]}
        />
        <button className="iconbtn" aria-label={'מחיקת שורת ההכנסה ' + i.label} onClick={() => act().deleteIncome(ev.id, i.id)}>
          ×
        </button>
      </td>
    </tr>
  );
}

export function IncomeCard({ ev, E }: { ev: BudgetEvent; E: EventResult }) {
  return (
    <section className="card" aria-labelledby={`income-${ev.id}`}>
      <h3 id={`income-${ev.id}`}>
        הכנסות <span className="hint">נרשמות בתקופה 1, בלי התייקרות</span>
      </h3>
      <label className="field-inline" style={{ marginBottom: 6 }}>
        קוד הכנסה בפריוריטי
        <span style={{ width: 150 }}>
          <TextInput
            className="cell"
            value={ev.incCode ?? ''}
            label="קוד הכנסה"
            placeholder="למשל 8.83-2"
            onChange={(v) => act().setEventField(ev.id, 'incCode', v)}
          />
        </span>
      </label>
      {ev.income.length ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">גרירה</span>
                </th>
                <th>מקור</th>
                <th className="n">משלמים</th>
                <th className="n">מחיר ₪</th>
                <th className="n">סה"כ</th>
                <th>הערה</th>
                <th>
                  <span className="sr-only">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ev.income.map((i) => (
                <IncomeRow key={i.id} ev={ev} E={E} i={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          אין הכנסות במפעל הזה.
        </p>
      )}
      <div className="addrow">
        <button className="btn small" onClick={() => act().addIncome(ev.id)}>
          + שורת הכנסה
        </button>
        <IncomePaste evId={ev.id} />
      </div>
    </section>
  );
}

function IncomePaste({ evId }: { evId: string }) {
  const clip = useClip((s) => s.clip);
  if (clip?.kind !== 'income') return null;
  return (
    <button className="btn small primary" onClick={() => void pasteClip({ kind: 'event', evId })}>
      הדבקת {clip.items.length === 1 ? 'שורת ההכנסה' : clip.items.length + ' שורות הכנסה'}
    </button>
  );
}
