import type { BudgetEvent, EventResult, Price, Val } from '../../../domain/types';
import { SALARY_LEVEL_KEY } from '../../../domain/compute';
import { useBudgetStore } from '../../../store';
import { fmtS } from '../../format';
import { insertIntoLastFx } from '../../components/fxFocus';
import { toast } from '../../uiStore';

const NO_GLOBALS: Record<string, Val> = {};
const NO_PRICES: Price[] = [];

function Chip({ name, value }: { name: string; value?: string }) {
  return (
    <button
      type="button"
      className="chip"
      // keep focus (and the caret) in the value field
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!insertIntoLastFx(name)) toast('קודם לחצו על שדה ערך או נוסחה');
      }}
    >
      {name}
      {value !== undefined && <b>{value}</b>}
    </button>
  );
}

export function FormulaHelp({ ev, E }: { ev: BudgetEvent; E: EventResult }) {
  const globals = useBudgetStore((s) => s.budget?.globals ?? NO_GLOBALS);
  const prices = useBudgetStore((s) => s.budget?.prices ?? NO_PRICES);
  return (
    <details className="help" style={{ marginTop: 8 }}>
      <summary>איך כותבים נוסחה</summary>
      <p>
        מתחילים ב-<span className="kbd">=</span> ומשתמשים בשמות: פרמטרים של המפעל, פרמטרים כלליים ומחירון. למשל{' '}
        <span className="kbd">=חניכים+מנחים</span> או <span className="kbd">=מאבטח+4*מאבטח_שעה</span>.
      </p>
      <p>
        פונקציות: <span className="kbd">למעלה(x)</span> עיגול כלפי מעלה, <span className="kbd">למטה(x)</span>,{' '}
        <span className="kbd">עגל(x)</span>, <span className="kbd">מקס(a,b)</span>, <span className="kbd">מינ(a,b)</span>,{' '}
        <span className="kbd">שכר("סמינריון")</span> שכר מנחה לפי הרמה שנבחרה.
      </p>
      <p>לחיצה על שם ברשימה מוסיפה אותו לשדה הערך האחרון שעמדתם בו.</p>
      <div className="chips-group">פרמטרים של המפעל</div>
      <div className="chips">
        {ev.params.map((p) => (
          <Chip key={p.id} name={p.key} value={E.params[p.id]?.err ? '⚠' : fmtS(E.params[p.id]?.v)} />
        ))}
      </div>
      <div className="chips-group">פרמטרים כלליים</div>
      <div className="chips">
        {Object.keys(globals)
          .filter((k) => k !== SALARY_LEVEL_KEY)
          .map((k) => (
            <Chip key={k} name={k} />
          ))}
      </div>
      <div className="chips-group">מחירון</div>
      <div className="chips">
        {prices.map((p) => (
          <Chip key={p.id} name={p.key} />
        ))}
      </div>
    </details>
  );
}
