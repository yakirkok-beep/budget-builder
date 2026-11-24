/** Save and backup (CLAUDE.md sections 8.7 and 10). */
import { useEffect, useRef, useState } from 'react';
import { isStoragePersisted, requestPersistentStorage, useBudgetStore } from '../../store';
import { deleteBudget, exportExcel, exportJson, importJsonFile, resetToTemplate, switchBudget } from '../actions';
import { openDialog, toast } from '../uiStore';
import { NewBudgetDialog } from './NewBudgetDialog';
import { PageHead } from '../components/PageHead';

const dayFmt = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' });
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeStyle: 'short' });
/** "24.11.2026 15:10", kept left-to-right so the parts don't swap places in RTL. */
const when = (t: number): string => `${dayFmt.format(t)} ${timeFmt.format(t)}`;

function PersistCard() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);
  const ask = async (): Promise<void> => {
    const r = await requestPersistentStorage();
    if (r === 'granted') {
      setPersisted(true);
      toast('הדפדפן אישר שמירה קבועה');
    } else if (r === 'denied') toast('הדפדפן לא אישר. אפשר לנסות שוב אחרי שימוש נוסף בכלי, ובינתיים לייצא גיבוי.');
    else toast('הדפדפן הזה לא תומך בבקשת שמירה קבועה');
  };
  return (
    <section className="card" aria-labelledby="persist-title">
      <h3 id="persist-title">שמירה בדפדפן</h3>
      <p>
        כל התקציבים נשמרים <b>רק בדפדפן הזה, במחשב הזה</b>. אין שרת ואין חשבון. כל שינוי נשמר אוטומטית אחרי שנייה וחצי.
      </p>
      <p className="muted">
        דפדפנים עלולים למחוק נתונים של אתרים כשחסר מקום. בקשת שמירה קבועה מבקשת מהדפדפן לא לעשות את זה. בכל מקרה כדאי לייצא גיבוי JSON מדי פעם.
      </p>
      <div className="addrow">
        {persisted ? (
          <span className="pill good" data-testid="persisted">
            השמירה הקבועה אושרה
          </span>
        ) : (
          <button className="btn" onClick={() => void ask()}>
            בקשת שמירה קבועה
          </button>
        )}
      </div>
    </section>
  );
}

export function DataView() {
  const budgets = useBudgetStore((s) => s.budgets);
  const currentId = useBudgetStore((s) => s.budgetId);
  const currentName = useBudgetStore((s) => s.budget?.name ?? '');
  const file = useRef<HTMLInputElement>(null);

  return (
    <>
      <PageHead eyebrow="הגדרות" title="שמירה וגיבוי" sub="תקציבים שמורים, גיבוי והעברה, ואיפוס" />
      <div className="grid2">
      <section className="card" aria-labelledby="budgets-title">
        <h3 id="budgets-title">
          התקציבים השמורים <span className="hint">למשל טיוטה ותרחיש חיסכון, זה לצד זה</span>
        </h3>
        <div className="scroll">
          <table className="budget-list" data-testid="budget-list">
            <thead>
              <tr>
                <th>שם</th>
                <th>נשמר לאחרונה</th>
                <th>
                  <span className="sr-only">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => {
                const open = b.id === currentId;
                return (
                  <tr key={b.id}>
                    <td>
                      {open ? currentName : b.name} {open && <span className="pill good">פתוח עכשיו</span>}
                    </td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {b.updatedAt ? <bdi dir="ltr">{when(b.updatedAt)}</bdi> : ''}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'end' }}>
                      {!open && (
                        <button className="btn small" onClick={() => void switchBudget(b.id)}>
                          פתיחה
                        </button>
                      )}{' '}
                      <button className="btn small danger" aria-label={'מחיקת התקציב ' + b.name} onClick={() => void deleteBudget(b.id, open ? currentName : b.name)}>
                        מחיקה
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="addrow">
          <button className="btn" onClick={() => openDialog(<NewBudgetDialog />)}>
            תקציב חדש
          </button>
          <button
            className="btn"
            onClick={() => {
              const el = document.getElementById('budget-name') as HTMLInputElement | null;
              el?.focus();
              el?.select();
            }}
          >
            שינוי שם
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="backup-title">
        <h3 id="backup-title">גיבוי והעברה</h3>
        <p className="muted">
          קובץ JSON שומר את כל התקציב הפתוח, כולל נוסחאות. אפשר לטעון אותו בחזרה (גם במחשב אחר), והוא נפתח כתקציב חדש בלי לדרוס את הקיים.
          כך טוענים גם את התבנית האמיתית של המחלקה, שנשמרת אצלכם כקובץ ולא באתר.
        </p>
        <div className="addrow">
          <button className="btn" data-testid="export-json" onClick={exportJson}>
            ייצוא JSON
          </button>
          <button className="btn" data-testid="import-json" onClick={() => file.current?.click()}>
            טעינת JSON
          </button>
          <button className="btn" onClick={() => void exportExcel()}>
            ייצוא ל-Excel
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importJsonFile(f);
          }}
        />
        <p className="muted" style={{ fontSize: 12 }}>
          בקובץ Excel הסכומים מופיעים כערכים, וליד כל שדה עם נוסחה מופיע טקסט הנוסחה. לשונית לכל מפעל, ריכוז, טבלת פריוריטי, פרמטרים ושכר.
        </p>
      </section>

      <PersistCard />

      <section className="card" aria-labelledby="reset-title">
        <h3 id="reset-title">התחלה מחדש</h3>
        <p className="muted">טעינת התבנית לדוגמה לתוך התקציב הפתוח. הנתונים הנוכחיים שלו יוחלפו, השם נשמר. כדי להתחיל מהתבנית האמיתית של המחלקה, טוענים את קובץ ה-JSON שלה ב"טעינת JSON".</p>
        <div className="addrow">
          <button className="btn danger" onClick={() => void resetToTemplate()}>
            איפוס לתבנית
          </button>
        </div>
      </section>
      </div>
    </>
  );
}
