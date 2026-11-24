import { useBudgetStore, useResult } from '../../store';
import { eventHref, hrefOf, type Route } from '../router';
import { openDialog } from '../uiStore';
import { AddEventDialog } from '../views/AddEventDialog';

export function Tabs({ route }: { route: Route }) {
  const events = useBudgetStore((s) => s.budget?.events);
  const R = useResult();
  if (!events || !R) return null;
  const withIssues = new Set(R.issues.map((i) => i.ev));
  const paramErrors = Object.keys(R.globalErrors).length + Object.keys(R.priceErrors).length > 0;
  const pages = [
    { view: 'params', label: 'פרמטרים ומחירון', dot: paramErrors },
    { view: 'salary', label: 'שכר מנחים', dot: false },
    { view: 'priority', label: 'טבלת פריוריטי', dot: false },
    { view: 'data', label: 'שמירה וגיבוי', dot: false },
  ] as const;
  return (
    <nav className="tabs" aria-label="מפעלים ותצוגות">
      <a className={`tab ${route.view === 'summary' ? 'on' : ''}`} href="#summary" aria-current={route.view === 'summary' ? 'page' : undefined}>
        ריכוז
      </a>
      {events.map((e) => {
        const on = route.view === 'event' && route.evId === e.id;
        return (
          <a
            key={e.id}
            className={`tab ${on ? 'on' : ''} ${e.active ? '' : 'off'}`}
            href={eventHref(e.id)}
            aria-current={on ? 'page' : undefined}
            title={e.active ? undefined : 'לא נכלל בתקציב'}
          >
            {e.name || 'מפעל ללא שם'}
            {withIssues.has(e.id) && <span className="dot" title="יש מה לבדוק" aria-label="יש מה לבדוק" />}
          </a>
        );
      })}
      <button className="tab" title="הוספת מפעל" onClick={() => openDialog(<AddEventDialog />)}>
        + מפעל
      </button>
      {pages.map((p, i) => {
        const on = route.view === p.view;
        return (
          <a key={p.view} className={`tab ${on ? 'on' : ''} ${i === 0 ? 'sep' : ''}`} href={hrefOf({ view: p.view })} aria-current={on ? 'page' : undefined}>
            {p.label}
            {p.dot && <span className="dot" title="יש ערך לא תקין" aria-label="יש ערך לא תקין" />}
          </a>
        );
      })}
    </nav>
  );
}
