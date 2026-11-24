/** Priority table (CLAUDE.md sections 7 and 8.6): one row per category and income, spread over 12 periods. */
import { priorityToTsv } from '../../domain/priority';
import type { PrioritySummary } from '../../domain/types';
import { useResult } from '../../store';
import { copyText } from '../clipboard';
import { fmt, MONTHS } from '../format';
import { eventHref } from '../router';
import { PageHead } from '../components/PageHead';

function Cell({ v }: { v: number }) {
  return <td className={`n ${v ? '' : 'zero'}`}>{v ? fmt(v) : ''}</td>;
}

function SumRow({ label, s }: { label: string; s: PrioritySummary }) {
  return (
    <tr className="tot">
      <td />
      <td className="label">{label}</td>
      <td />
      <td className="n">{fmt(s.total)}</td>
      <td />
      {s.m.map((v, i) => (
        <td className="n" key={i}>
          {fmt(v)}
        </td>
      ))}
      <td className="n">{s.none ? fmt(s.none) : ''}</td>
    </tr>
  );
}

export function PriorityView() {
  const R = useResult()!;
  const T = R.priority;
  return (
    <>
    <PageHead
      eyebrow="דוחות"
      title="טבלת פריוריטי"
      sub="סעיף לכל קטגוריה והכנסה, פרוס ל-12 תקופות"
      actions={
        <button className="btn small primary" data-testid="copy-tsv" onClick={() => void copyText(priorityToTsv(T), 'הטבלה הועתקה. אפשר להדביק ב-Excel')}>
          העתקת הטבלה ל-Excel
        </button>
      }
    />
    <section className="card" aria-labelledby="pri-title">
      <h3 id="pri-title">
        טבלת סעיפים לפריוריטי{' '}
        <span className="hint">P = הוצאה, S = הכנסה. הכנסות נרשמות בתקופה 1, "שנתי" נפרס שווה ל-12 חודשים. רק מפעלים שנכללים בתקציב.</span>
      </h3>
      <div className="scroll">
        <table className="pri-table" data-testid="priority-table">
          <thead>
            <tr>
              <th>קוד</th>
              <th>מפעל - קטגוריה</th>
              <th>סוג</th>
              <th className="n">סכום ₪</th>
              <th>תקופה</th>
              {MONTHS.map((m, i) => (
                <th className="n" key={m} title={m}>
                  {i + 1}
                </th>
              ))}
              <th className="n">ללא תקופה</th>
            </tr>
          </thead>
          <tbody>
            {T.rows.map((r, k) => (
              <tr key={k}>
                <td>{r.code ? <span dir="ltr">{r.code}</span> : <span className="pill bad">חסר קוד</span>}</td>
                <td className="label">
                  <a href={eventHref(r.ev)}>{r.label}</a>
                </td>
                <td>{r.type}</td>
                <td className="n">
                  <b>{fmt(r.amt)}</b>
                </td>
                <td>{r.period === '' ? <span className="pill warn">לקבוע</span> : r.period}</td>
                {r.m.map((v, i) => (
                  <Cell key={i} v={v} />
                ))}
                <td className="n">{r.none ? <span className="pill warn">{fmt(r.none)}</span> : ''}</td>
              </tr>
            ))}
            <SumRow label='סה"כ הוצאות' s={T.expenses} />
            <SumRow label='סה"כ הכנסות' s={T.income} />
          </tbody>
        </table>
      </div>
    </section>
    </>
  );
}
