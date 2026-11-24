/** Guide salary table (CLAUDE.md section 8.5): hours, computed minimum wage, 4 levels. */
import { useState } from 'react';
import { constField, minimumWage, SALARY_LEVEL_KEY } from '../../domain/compute';
import { countSalaryUses } from '../../domain/rename';
import { LEVELS } from '../../domain/types';
import { budgetStore, useBudgetStore, useResult } from '../../store';
import { fmt } from '../format';
import { FxInput, KeyInput, TextInput } from '../components/inputs';
import { confirmDialog } from '../uiStore';
import { PageHead } from '../components/PageHead';

const act = () => budgetStore.getState();

async function deleteRow(id: string, name: string): Promise<void> {
  const b = act().budget;
  const uses = b ? countSalaryUses(b, name) : 0;
  if (uses > 0) {
    const ok = await confirmDialog({
      title: 'מחיקת שורת שכר',
      message: `שכר("${name}") משמש ב-${uses === 1 ? 'נוסחה אחת' : uses + ' נוסחאות'}. אחרי המחיקה הן יציגו שגיאה. למחוק?`,
      ok: 'מחיקה',
      danger: true,
    });
    if (!ok) return;
  }
  act().deleteSalaryRow(id);
}

export function SalaryView() {
  const rows = useBudgetStore((s) => s.budget!.salary);
  const level = useBudgetStore((s) => String(s.budget!.globals[SALARY_LEVEL_KEY] ?? ''));
  const R = useResult()!;
  const [focusId, setFocusId] = useState<string | null>(null);

  return (
    <>
    <PageHead eyebrow="הגדרות" title="שכר מנחים" sub="שכר מנחה לאירוע לפי סוג האירוע ורמת הוותק" />
    <section className="card" aria-labelledby="salary-title">
      <h3 id="salary-title">
        טבלת שכר מנחים לאירוע{' '}
        <span className="hint">
          הרמה שבשימוש: <b>{level}</b> (משנים בפרמטרים הכלליים). בנוסחה: <span className="kbd">שכר("שם האירוע")</span>. שינוי שם
          מעדכן את כל הנוסחאות.
        </span>
      </h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>סוג אירוע</th>
              <th className="n">שעות</th>
              <th className="n">שכר מינימום</th>
              {LEVELS.map((l) => (
                <th key={l} className={`n ${l === level ? 'lvl-on' : ''}`} aria-current={l === level ? 'true' : undefined}>
                  {l}
                </th>
              ))}
              <th>הערות</th>
              <th>
                <span className="sr-only">מחיקה</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mw = minimumWage(r.hours, R.globals);
              return (
                <tr key={r.id}>
                  <td style={{ width: '20%' }}>
                    <KeyInput value={r.name} label="סוג אירוע" autoFocus={r.id === focusId} onCommit={(n) => act().renameSalaryRow(r.id, n)} />
                  </td>
                  <td style={{ width: '8%' }}>
                    <FxInput value={r.hours} label={'שעות ' + r.name} result={constField(r.hours)} onChange={(v) => act().setSalaryField(r.id, 'hours', v)} />
                  </td>
                  <td className="n muted">{mw != null ? fmt(mw) : ''}</td>
                  {LEVELS.map((l) => (
                    <td key={l} style={{ width: '10%' }} className={l === level ? 'lvl-on' : ''}>
                      <FxInput
                        value={r.levels[l]}
                        label={`${l} ${r.name}`}
                        result={constField(r.levels[l])}
                        testId={`salary-${r.name}-${l}`}
                        onChange={(v) => act().setSalaryLevel(r.id, l, v)}
                      />
                    </td>
                  ))}
                  <td>
                    <TextInput value={r.note} label={'הערה ' + r.name} onChange={(v) => act().setSalaryField(r.id, 'note', v)} />
                  </td>
                  <td>
                    <button className="iconbtn" aria-label={'מחיקת ' + r.name} onClick={() => void deleteRow(r.id, r.name)}>
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
        <button className="btn small" onClick={() => setFocusId(act().addSalaryRow())}>
          + סוג אירוע
        </button>
      </div>
    </section>
    </>
  );
}
