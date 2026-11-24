import { useState } from 'react';
import type { BudgetEvent, EventResult } from '../../../domain/types';
import { budgetStore } from '../../../store';
import { fmtS } from '../../format';
import { FxInput, KeyInput, TextInput } from '../../components/inputs';
import { FormulaHelp } from './FormulaHelp';

const act = () => budgetStore.getState();

export function ParamsCard({ ev, E }: { ev: BudgetEvent; E: EventResult }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  return (
    <section className="card" aria-labelledby={`params-${ev.id}`}>
      <h3 id={`params-${ev.id}`}>
        פרמטרים <span className="hint">מספר או נוסחה שמתחילה ב-= . השם משמש בנוסחאות של השורות.</span>
      </h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>שם</th>
              <th>ערך / נוסחה</th>
              <th className="n">תוצאה</th>
              <th>הערה</th>
              <th>
                <span className="sr-only">מחיקה</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ev.params.map((p) => {
              const r = E.params[p.id];
              return (
                <tr key={p.id}>
                  <td style={{ width: '30%' }}>
                    <KeyInput
                      value={p.key}
                      label="שם פרמטר"
                      autoFocus={p.id === focusId}
                      onCommit={(k) => act().renameParam(ev.id, p.id, k)}
                    />
                  </td>
                  <td style={{ width: '24%' }}>
                    <FxInput
                      value={p.value}
                      label={'ערך ' + p.key}
                      result={r}
                      hideResult
                      testId={`param-${p.key}`}
                      onChange={(v) => act().setParamField(ev.id, p.id, 'value', v)}
                    />
                  </td>
                  <td className={`n ${r?.err ? 'err' : ''}`} data-testid={`param-result-${p.key}`}>
                    {r?.err ? '⚠ ' + r.err : fmtS(r?.v)}
                  </td>
                  <td>
                    <TextInput value={p.note} label={'הערה ל' + p.key} onChange={(v) => act().setParamField(ev.id, p.id, 'note', v)} />
                  </td>
                  <td>
                    <button className="iconbtn" aria-label={'מחיקת הפרמטר ' + p.key} onClick={() => act().deleteParam(ev.id, p.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="addrow">
        <button className="btn small" onClick={() => setFocusId(act().addParam(ev.id))}>
          + פרמטר
        </button>
        <label className="field-inline">
          משתתפים לחישוב עלות לנפש:
          <select value={ev.partKey ?? ''} onChange={(e) => act().setEventField(ev.id, 'partKey', e.target.value || null)}>
            <option value="">ללא</option>
            {ev.params.map((p) => (
              <option key={p.id} value={p.key}>
                {p.key}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FormulaHelp ev={ev} E={E} />
    </section>
  );
}
