/** The totals, always at the top (CLAUDE.md section 8.1), as portal-style summary cards. */
import { useBudgetStore, useResult } from '../../store';
import { Kit } from '../components/Kit';
import { changeClass, fmt, fmtSigned } from '../format';

export function Ledger() {
  const R = useResult();
  const activeCount = useBudgetStore((s) => s.budget?.events.filter((e) => e.active).length ?? 0);
  if (!R) return null;
  const T = R.tot;
  const def26 = T.plan26 - T.incPlan26;
  const has2026 = T.plan26 !== 0 || T.incPlan26 !== 0;
  const chg = T.def - def26;
  return (
    <section className="ledger" aria-label="סיכום התקציב">
      <div>
        <span className="lab">הוצאות</span>
        <Kit name="expenses" />
        <span className="num" data-testid="ledger-exp">{fmt(T.exp)}</span>
        <span className="sub">תכנון 2026: {has2026 ? fmt(T.plan26) : '-'}</span>
      </div>
      <div>
        <span className="lab">הכנסות</span>
        <Kit name="income" />
        <span className="num" data-testid="ledger-inc">{fmt(T.inc)}</span>
        <span className="sub">תכנון 2026: {has2026 ? fmt(T.incPlan26) : '-'}</span>
      </div>
      <div className="def">
        <span className="lab">גירעון (השתתפות התנועה)</span>
        <Kit name="deficit" />
        <span className="num" data-testid="ledger-def">{fmt(T.def)}</span>
        <span className="sub">תכנון 2026: {has2026 ? fmt(def26) : '-'}</span>
      </div>
      <div>
        <span className="lab">שינוי בגירעון מול 2026</span>
        <Kit name="change" />
        <span className={`num ${has2026 ? changeClass(chg) : ''}`} data-testid="ledger-chg">
          {has2026 ? fmtSigned(chg) : '-'}
        </span>
        <span className="sub">{has2026 ? `ללא אירועי הוועידה · ${activeCount} מפעלים פעילים` : 'אין נתוני 2026 בתקציב הזה'}</span>
      </div>
    </section>
  );
}
