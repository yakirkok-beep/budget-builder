import { useState } from 'react';
import type { BudgetEvent, EventResult, Param } from '../../../domain/types';
import { budgetStore } from '../../../store';
import { fmtS } from '../../format';
import { DragHandle } from '../../components/DragHandle';
import { FxInput, KeyInput, TextInput } from '../../components/inputs';
import { RowMenu } from '../../components/RowMenu';
import { copyParams, openTransfer, pasteClip, useClip } from '../../transfer';
import { useDrop } from '../../useDrop';
import { FormulaHelp } from './FormulaHelp';

const act = () => budgetStore.getState();

function ParamRow({ ev, E, p, autoFocus }: { ev: BudgetEvent; E: EventResult; p: Param; autoFocus: boolean }) {
  const r = E.params[p.id];
  const drop = useDrop({ kind: 'param', evId: ev.id, id: p.id });
  return (
    <tr className={drop.over ? 'drop-before' : ''} {...drop.props}>
      <td className="grip">
        <DragHandle payload={{ kind: 'params', evId: ev.id, ids: [p.id] }} label={'גרירת ' + p.key} />
      </td>
      <td style={{ width: '30%' }}>
        <KeyInput value={p.key} label="שם פרמטר" autoFocus={autoFocus} onCommit={(k) => act().renameParam(ev.id, p.id, k)} />
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
      <td className="row-actions">
        <RowMenu
          label={'פעולות על ' + p.key}
          items={[
            { label: 'שכפול', onSelect: () => act().duplicateParam(ev.id, p.id) },
            { label: 'העתקה', onSelect: () => copyParams(ev.id, [p.id]) },
            { label: 'העתקה למפעל אחר...', onSelect: () => openTransfer({ kind: 'params', evId: ev.id, ids: [p.id] }) },
            { label: 'מחיקה', danger: true, onSelect: () => act().deleteParam(ev.id, p.id) },
          ]}
        />
        <button className="iconbtn" aria-label={'מחיקת הפרמטר ' + p.key} onClick={() => act().deleteParam(ev.id, p.id)}>
          ×
        </button>
      </td>
    </tr>
  );
}

export function ParamsCard({ ev, E }: { ev: BudgetEvent; E: EventResult }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const clip = useClip((s) => s.clip);
  return (
    <section className="card" aria-labelledby={`params-${ev.id}`}>
      <h3 id={`params-${ev.id}`}>
        פרמטרים <span className="hint">מספר או נוסחה שמתחילה ב-= . השם משמש בנוסחאות של השורות.</span>
      </h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>
                <span className="sr-only">גרירה</span>
              </th>
              <th>שם</th>
              <th>ערך / נוסחה</th>
              <th className="n">תוצאה</th>
              <th>הערה</th>
              <th>
                <span className="sr-only">פעולות</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ev.params.map((p) => (
              <ParamRow key={p.id} ev={ev} E={E} p={p} autoFocus={p.id === focusId} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="addrow">
        <button className="btn small" onClick={() => setFocusId(act().addParam(ev.id))}>
          + פרמטר
        </button>
        {clip?.kind === 'params' && (
          <button className="btn small primary" onClick={() => void pasteClip({ kind: 'event', evId: ev.id })}>
            הדבקת {clip.items.length === 1 ? 'הפרמטר' : clip.items.length + ' פרמטרים'}
          </button>
        )}
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
