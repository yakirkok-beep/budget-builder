/** Global parameters and the price list (CLAUDE.md section 8.4). */
import { useState } from 'react';
import { SALARY_LEVEL_KEY } from '../../domain/compute';
import { countNameUses } from '../../domain/rename';
import { LEVELS, type BudgetResult, type FieldResult, type Price } from '../../domain/types';
import { budgetStore, useBudgetStore, useResult } from '../../store';
import { DragHandle } from '../components/DragHandle';
import { RowMenu } from '../components/RowMenu';
import { useDrop } from '../useDrop';
import { FxInput, KeyInput, TextInput } from '../components/inputs';
import { copyPrices, pasteClip, useClip } from '../transfer';
import { confirmDialog } from '../uiStore';
import { PageHead } from '../components/PageHead';

const act = () => budgetStore.getState();

async function deletePrice(id: string, key: string): Promise<void> {
  const b = act().budget;
  const uses = b ? countNameUses(b, key) : 0;
  if (uses > 0) {
    const ok = await confirmDialog({
      title: 'מחיקת פריט מהמחירון',
      message: `"${key}" משמש ב-${uses === 1 ? 'נוסחה אחת' : uses + ' נוסחאות'}. אחרי המחיקה הן יציגו שגיאה. למחוק?`,
      ok: 'מחיקה',
      danger: true,
    });
    if (!ok) return;
  }
  act().deletePrice(id);
}

export function ParamsView() {
  const globals = useBudgetStore((s) => s.budget!.globals);
  const notes = useBudgetStore((s) => s.budget!.globalNotes);
  const prices = useBudgetStore((s) => s.budget!.prices);
  const R = useResult()!;
  const [focusId, setFocusId] = useState<string | null>(null);

  const globalResult = (k: string): FieldResult => (R.globalErrors[k] ? { err: R.globalErrors[k]! } : { v: R.globals[k] ?? null });

  return (
    <>
      <PageHead eyebrow="הגדרות" title="פרמטרים ומחירון" sub="ערכים שמשפיעים על כל המפעלים, ומחירים שהנוסחאות משתמשות בהם" />
      <div className="grid2">
      <section className="card" aria-labelledby="globals-title">
        <h3 id="globals-title">
          פרמטרים כלליים <span className="hint">משפיעים על כל המפעלים</span>
        </h3>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>שם בנוסחאות</th>
                <th>ערך</th>
                <th>הסבר</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(globals).map((k) => (
                <tr key={k}>
                  <td style={{ paddingTop: 8 }}>
                    <span className="kbd">{k}</span>
                  </td>
                  <td style={{ width: '24%' }}>
                    {k === SALARY_LEVEL_KEY ? (
                      <select
                        className="cell val"
                        value={String(globals[k])}
                        aria-label="רמת שכר מנחים"
                        data-testid="salary-level"
                        onChange={(e) => act().setGlobal(k, e.target.value)}
                      >
                        {LEVELS.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                        {!LEVELS.includes(String(globals[k]) as (typeof LEVELS)[number]) && <option>{String(globals[k])}</option>}
                      </select>
                    ) : (
                      <FxInput value={globals[k]!} label={k} result={globalResult(k)} testId={`global-${k}`} onChange={(v) => act().setGlobal(k, v)} />
                    )}
                  </td>
                  <td className="muted" style={{ paddingTop: 8 }}>
                    {notes[k] ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          אחוזים כשבר עשרוני: 0.07 = 7%. אפשר גם לכתוב 7%.
        </p>
      </section>

      <section className="card" aria-labelledby="prices-title">
        <h3 id="prices-title">
          מחירון <span className="hint">שינוי שם מעדכן את כל הנוסחאות שמשתמשות בו</span>
        </h3>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">גרירה</span>
                </th>
                <th>שם בנוסחאות</th>
                <th>תיאור</th>
                <th className="n">מחיר ₪</th>
                <th>יחידה</th>
                <th>
                  <span className="sr-only">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <PriceRow key={p.id} p={p} R={R} autoFocus={p.id === focusId} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="addrow">
          <button className="btn small" onClick={() => setFocusId(act().addPrice())}>
            + מחיר
          </button>
          <PastePrices />
        </div>
      </section>
      </div>
    </>
  );
}

function PriceRow({ p, R, autoFocus }: { p: Price; R: BudgetResult; autoFocus: boolean }) {
  const drop = useDrop({ kind: 'price', id: p.id });
  return (
    <tr className={drop.over ? 'drop-before' : ''} {...drop.props}>
      <td className="grip">
        <DragHandle payload={{ kind: 'price', id: p.id }} label={'גרירת ' + p.key} />
      </td>
      <td style={{ width: '24%' }}>
        <KeyInput value={p.key} label="שם בנוסחאות" autoFocus={autoFocus} onCommit={(k) => act().renamePrice(p.id, k)} />
      </td>
      <td>
        <TextInput value={p.label} label={'תיאור ' + p.key} onChange={(v) => act().setPriceField(p.id, 'label', v)} />
      </td>
      <td style={{ width: '15%' }}>
        <FxInput
          value={p.value}
          label={'מחיר ' + p.key}
          result={R.priceErrors[p.id] ? { err: R.priceErrors[p.id]! } : { v: R.prices[p.key] ?? null }}
          testId={`price-${p.key}`}
          onChange={(v) => act().setPriceField(p.id, 'value', v)}
        />
      </td>
      <td style={{ width: '16%' }}>
        <TextInput value={p.unit} label={'יחידה ' + p.key} onChange={(v) => act().setPriceField(p.id, 'unit', v)} />
      </td>
      <td className="row-actions">
        <RowMenu
          label={'פעולות על ' + p.key}
          items={[
            { label: 'שכפול', onSelect: () => act().duplicatePrice(p.id) },
            { label: 'העתקה (לתקציב אחר)', onSelect: () => copyPrices([p.id]) },
            { label: 'מחיקה', danger: true, onSelect: () => void deletePrice(p.id, p.key) },
          ]}
        />
        <button className="iconbtn" aria-label={'מחיקת ' + p.key} onClick={() => void deletePrice(p.id, p.key)}>
          ×
        </button>
      </td>
    </tr>
  );
}

function PastePrices() {
  const clip = useClip((s) => s.clip);
  if (clip?.kind !== 'prices') return null;
  return (
    <button className="btn small primary" onClick={() => void pasteClip({ kind: 'budget' })}>
      הדבקה למחירון
    </button>
  );
}
