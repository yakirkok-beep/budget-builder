/** Summary screen (CLAUDE.md section 8.2): all events, a simple bar chart, and the issues list. */
import type { Issue } from '../../domain/types';
import { budgetStore, useBudgetStore, useResult } from '../../store';
import { changeClass, fmt, fmtSigned } from '../format';
import { eventHref, navigate } from '../router';

export function Summary() {
  const events = useBudgetStore((s) => s.budget?.events);
  const R = useResult();
  if (!events || !R) return null;
  const T = R.tot;
  const active = events.filter((e) => e.active);
  const max = Math.max(1, ...active.map((e) => R.ev[e.id]!.exp));

  const issuesByEvent = new Map<string, Issue[]>();
  for (const i of R.issues) issuesByEvent.set(i.ev, [...(issuesByEvent.get(i.ev) ?? []), i]);

  return (
    <div className="sumgrid">
      <section className="card" aria-labelledby="sum-title">
        <h3 id="sum-title">
          כל המפעלים <span className="hint">לחיצה על שורה פותחת את המפעל. התיבה קובעת אם הוא נכלל בתקציב.</span>
        </h3>
        <div className="scroll">
          <table data-testid="summary-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">נכלל בתקציב</span>
                </th>
                <th>מפעל</th>
                <th className="n">הוצאות</th>
                <th className="n">הכנסות</th>
                <th className="n">גירעון</th>
                <th className="n">משתתפים</th>
                <th className="n">עלות לנפש</th>
                <th className="n">הוצאות תכנון 2026</th>
                <th className="n">ניצול 2026 מתוקן</th>
                <th className="n">שינוי מול תכנון</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const E = R.ev[e.id]!;
                const chg = E.exp - E.plan26;
                const issueCount = E.issues.length;
                return (
                  <tr key={e.id} className={`clickable ${e.active ? '' : 'inactive'}`} onClick={() => navigate(eventHref(e.id))}>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={e.active}
                        aria-label={'לכלול בתקציב את ' + e.name}
                        onChange={(ev) => budgetStore.getState().setEventField(e.id, 'active', ev.target.checked)}
                      />
                    </td>
                    <td>
                      <a href={eventHref(e.id)} onClick={(ev) => ev.stopPropagation()}>
                        {e.name || 'מפעל ללא שם'}
                      </a>{' '}
                      {issueCount > 0 && <span className="pill warn">{issueCount} לבדיקה</span>}
                    </td>
                    <td className="n">{fmt(E.exp)}</td>
                    <td className="n">{E.inc ? fmt(E.inc) : '-'}</td>
                    <td className="n">{fmt(E.def)}</td>
                    <td className="n">{E.part != null ? fmt(E.part) : ''}</td>
                    <td className="n">{E.perHead != null ? fmt(E.perHead) : ''}</td>
                    <td className="n muted">{E.plan26 ? fmt(E.plan26) : '-'}</td>
                    <td className="n muted">{E.act26 ? fmt(E.act26) : '-'}</td>
                    <td className={`n ${E.plan26 ? changeClass(chg) : ''}`}>{E.plan26 ? fmtSigned(chg) : 'חדש'}</td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td />
                <td>סה"כ (מפעלים פעילים)</td>
                <td className="n">{fmt(T.exp)}</td>
                <td className="n">{fmt(T.inc)}</td>
                <td className="n">{fmt(T.def)}</td>
                <td />
                <td />
                <td className="n">{fmt(T.plan26)}</td>
                <td className="n">{fmt(T.act26)}</td>
                <td className={`n ${changeClass(T.exp - T.plan26)}`}>{fmtSigned(T.exp - T.plan26)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {T.plan26 === 0 && T.act26 === 0 && (
          <p className="note" data-testid="example-hint">
            בתקציב הזה אין נתוני 2026. אם זו התבנית לדוגמה, את התבנית האמיתית של המחלקה טוענים מקובץ JSON במסך{' '}
            <a href="#data">שמירה וגיבוי</a>.
          </p>
        )}
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          ניצול 2026 מתוקן = ניצול עד 24.11.2026 כולל הזמנות פתוחות, אחרי תיקוני הסיווג, לפני צפי דצמבר. מפעל בלי נתוני 2026 מסומן "חדש".
        </p>
      </section>

      <div className="sumside">
        <section className="card" aria-labelledby="bars-title">
          <h3 id="bars-title">הוצאות מול הכנסות</h3>
          <div className="bars" role="list">
            {active.map((e) => {
              const E = R.ev[e.id]!;
              return (
                <div className="bar" role="listitem" key={e.id} aria-label={`${e.name}: הוצאות ${fmt(E.exp)}, הכנסות ${fmt(E.inc)}`}>
                  <span>{e.name}</span>
                  <span className="track" aria-hidden="true">
                    <span className="exp" style={{ width: `${((E.exp / max) * 100).toFixed(1)}%` }} />
                    <span className="inc" style={{ width: `${((Math.min(E.inc, E.exp * 4) / max) * 100).toFixed(1)}%` }} />
                  </span>
                  <span className="n" style={{ textAlign: 'end' }}>
                    {fmt(E.exp)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="legend" aria-hidden="true">
            <span>
              <i style={{ background: 'var(--accent)' }} />
              הוצאות
            </span>
            <span>
              <i style={{ background: 'var(--good)', opacity: 0.55 }} />
              הכנסות
            </span>
          </div>
        </section>

        <section className="card" aria-labelledby="issues-title">
          <h3 id="issues-title">לבדיקה</h3>
          {issuesByEvent.size === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              אין שגיאות בנוסחאות, וכל השורות משויכות לקטגוריה עם קוד ותקופה.
            </p>
          ) : (
            [...issuesByEvent].map(([evId, list]) => (
              <div className="issue-group" key={evId}>
                <a href={eventHref(evId)}>{list[0]!.name}</a>
                <ul className="issues">
                  {list.map((i) => (
                    <li key={i.kind}>{i.msg}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
