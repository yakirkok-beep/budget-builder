import type { BudgetEvent, EventResult } from '../../../domain/types';
import { budgetStore } from '../../../store';
import { fmt } from '../../format';
import { FxInput, TextInput } from '../../components/inputs';

const act = () => budgetStore.getState();

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
                <th>מקור</th>
                <th className="n">משלמים</th>
                <th className="n">מחיר ₪</th>
                <th className="n">סה"כ</th>
                <th>הערה</th>
                <th>
                  <span className="sr-only">מחיקה</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ev.income.map((i) => {
                const I = E.income[i.id];
                return (
                  <tr key={i.id}>
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
                    <td>
                      <button className="iconbtn" aria-label={'מחיקת שורת ההכנסה ' + i.label} onClick={() => act().deleteIncome(ev.id, i.id)}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
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
      </div>
    </section>
  );
}
