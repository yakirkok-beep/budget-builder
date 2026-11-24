/** Fixed totals strip (CLAUDE.md section 8.1), each with its 2026 value. */
import { useBudgetStore, useResult } from '../../store';
import { changeClass, fmt, fmtSigned } from '../format';

export function Ledger() {
  const R = useResult();
  const activeCount = useBudgetStore((s) => s.budget?.events.filter((e) => e.active).length ?? 0);
  if (!R) return null;
  const T = R.tot;
  const def26 = T.plan26 - T.incPlan26;
  const chg = T.def - def26;
  return (
    <section className="ledger" aria-label="סיכום התקציב">
      <div>
        <div className="lab">הוצאות</div>
        <div className="num" data-testid="ledger-exp">{fmt(T.exp)}</div>
        <div className="sub">תכנון 2026: {fmt(T.plan26)}</div>
      </div>
      <div>
        <div className="lab">הכנסות</div>
        <div className="num" data-testid="ledger-inc">{fmt(T.inc)}</div>
        <div className="sub">תכנון 2026: {fmt(T.incPlan26)}</div>
      </div>
      <div className="def">
        <div className="lab">גירעון (השתתפות התנועה)</div>
        <div className="num" data-testid="ledger-def">{fmt(T.def)}</div>
        <div className="sub">תכנון 2026: {fmt(def26)}</div>
      </div>
      <div>
        <div className="lab">שינוי בגירעון מול 2026</div>
        <div className={`num ${changeClass(chg)}`} data-testid="ledger-chg">{fmtSigned(chg)}</div>
        <div className="sub">ללא אירועי הוועידה · {activeCount} מפעלים פעילים</div>
      </div>
    </section>
  );
}
