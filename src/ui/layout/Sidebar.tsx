/**
 * Navigation like the staff portal: a sidebar on wide screens (groups with hand-written titles,
 * kit icons, a gold stroke under the active item), and on phones a strip of event pills at the
 * top plus a tab bar at the bottom.
 */
import { KIT, type KitName } from '../kit';
import { useBudgetStore, useResult } from '../../store';
import { Kit } from '../components/Kit';
import { eventHref, hrefOf, type Route } from '../router';
import { openDialog } from '../uiStore';
import { AddEventDialog } from '../views/AddEventDialog';

type Page = { view: 'summary' | 'params' | 'salary' | 'priority' | 'data'; label: string; short: string; icon: KitName };

const PAGES: Page[] = [
  { view: 'summary', label: 'ריכוז', short: 'ריכוז', icon: 'summary' },
  { view: 'params', label: 'פרמטרים ומחירון', short: 'פרמטרים', icon: 'params' },
  { view: 'salary', label: 'שכר מנחים', short: 'שכר', icon: 'salary' },
  { view: 'priority', label: 'טבלת פריוריטי', short: 'פריוריטי', icon: 'priority' },
  { view: 'data', label: 'שמירה וגיבוי', short: 'שמירה', icon: 'data' },
];

const addEvent = (): void => openDialog(<AddEventDialog />);

function useNavData() {
  const events = useBudgetStore((s) => s.budget?.events);
  const R = useResult();
  const withIssues = new Set(R?.issues.map((i) => i.ev));
  const paramErrors = R ? Object.keys(R.globalErrors).length + Object.keys(R.priceErrors).length > 0 : false;
  return { events, withIssues, paramErrors };
}

function PageLink({ p, route, dot }: { p: Page; route: Route; dot?: boolean }) {
  const on = route.view === p.view;
  return (
    <a className={`nav-item ${on ? 'on' : ''}`} href={hrefOf({ view: p.view })} aria-current={on ? 'page' : undefined}>
      <Kit name={p.icon} />
      <span className="label">{p.label}</span>
      {dot && <span className="dot" title="יש ערך לא תקין" aria-label="יש ערך לא תקין" />}
    </a>
  );
}

export function Sidebar({ route }: { route: Route }) {
  const { events, withIssues, paramErrors } = useNavData();
  if (!events) return null;
  return (
    <nav className="sidebar" aria-label="ניווט">
      <a className="side-logo" href="#summary">
        <img src={KIT.logo} alt="תנועת עזרא" />
        <span className="side-tool">בונה התקציב</span>
      </a>

      <div className="side-group">
        <span className="side-title">התקציב</span>
        <PageLink p={PAGES[0]!} route={route} />
      </div>

      <div className="side-group">
        <span className="side-title">מפעלים</span>
        {events.map((e) => {
          const on = route.view === 'event' && route.evId === e.id;
          return (
            <a
              key={e.id}
              className={`nav-item nav-event ${on ? 'on' : ''} ${e.active ? '' : 'off'}`}
              href={eventHref(e.id)}
              aria-current={on ? 'page' : undefined}
              title={e.active ? undefined : 'לא נכלל בתקציב'}
            >
              <span className="label">{e.name || 'מפעל ללא שם'}</span>
              {withIssues.has(e.id) && <span className="dot" title="יש מה לבדוק" aria-label="יש מה לבדוק" />}
            </a>
          );
        })}
        <button className="btn small side-add" title="הוספת מפעל" onClick={addEvent}>
          + מפעל
        </button>
      </div>

      <div className="side-group">
        <span className="side-title">הגדרות ודוחות</span>
        {PAGES.slice(1).map((p) => (
          <PageLink key={p.view} p={p} route={route} dot={p.view === 'params' && paramErrors} />
        ))}
      </div>

      <div className="side-foot">הנתונים שמורים רק בדפדפן הזה.</div>
    </nav>
  );
}

/** Phones: event pills under the totals. */
export function MobileEvents({ route }: { route: Route }) {
  const { events, withIssues } = useNavData();
  if (!events) return null;
  return (
    <nav className="mnav" aria-label="מפעלים">
      {events.map((e) => {
        const on = route.view === 'event' && route.evId === e.id;
        return (
          <a key={e.id} className={`${on ? 'on' : ''} ${e.active ? '' : 'off'}`} href={eventHref(e.id)} aria-current={on ? 'page' : undefined}>
            {e.name || 'מפעל ללא שם'}
            {withIssues.has(e.id) && <span className="dot" aria-label="יש מה לבדוק" />}
          </a>
        );
      })}
      <button title="הוספת מפעל" onClick={addEvent}>
        + מפעל
      </button>
    </nav>
  );
}

/** Phones: the bottom tab bar. */
export function TabBar({ route }: { route: Route }) {
  return (
    <nav className="tabbar" aria-label="מסכים">
      {PAGES.map((p) => {
        const on = route.view === p.view;
        return (
          <a key={p.view} className={on ? 'on' : ''} href={hrefOf({ view: p.view })} aria-current={on ? 'page' : undefined}>
            <Kit name={p.icon} />
            {p.short}
          </a>
        );
      })}
    </nav>
  );
}
