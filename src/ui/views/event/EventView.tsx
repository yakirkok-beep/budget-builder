/** The event screen (CLAUDE.md section 8.3): the main working screen. */
import { budgetStore, useBudgetStore, useResult } from '../../../store';
import { TextInput } from '../../components/inputs';
import { eventHref, navigate } from '../../router';
import { confirmDialog, toast } from '../../uiStore';
import { CategoriesCard } from './CategoriesCard';
import { EventNames } from './EventNames';
import { IncomeCard } from './IncomeCard';
import { LinesCard } from './LinesCard';
import { ParamsCard } from './ParamsCard';

const act = () => budgetStore.getState();

export function EventView({ evId }: { evId: string }) {
  const ev = useBudgetStore((s) => s.budget?.events.find((e) => e.id === evId));
  const R = useResult();
  const E = R?.ev[evId];

  if (!ev || !E) {
    return (
      <div className="card">
        <p>המפעל לא נמצא. אולי הוא נמחק.</p>
        <a href="#summary">חזרה לריכוז</a>
      </div>
    );
  }

  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'מחיקת מפעל',
      message: `למחוק את המפעל "${ev.name}"? אפשר במקום זה להוריד את הסימון "נכלל בתקציב".`,
      ok: 'מחיקה',
      danger: true,
    });
    if (!ok) return;
    act().deleteEvent(ev.id);
    navigate({ view: 'summary' });
    toast('המפעל נמחק');
  };

  return (
    <>
      <div className="evhead">
        <TextInput className="title" value={ev.name} label="שם המפעל" testId="event-name" onChange={(v) => act().setEventField(ev.id, 'name', v)} />
        <label className={`pill ${ev.active ? 'good' : ''}`}>
          <input type="checkbox" checked={ev.active} onChange={(e) => act().setEventField(ev.id, 'active', e.target.checked)} /> נכלל בתקציב
        </label>
        <span className="spacer" />
        <button
          className="btn small"
          onClick={() => {
            navigate(eventHref(act().duplicateEvent(ev.id)));
            toast('נוצר עותק של המפעל');
          }}
        >
          שכפול מפעל
        </button>
        <button className="btn small danger" onClick={() => void remove()}>
          מחיקת מפעל
        </button>
        <div className="sub">
          <TextInput value={ev.sub} label="תיאור קצר" placeholder="תיאור קצר (לא חובה)" onChange={(v) => act().setEventField(ev.id, 'sub', v)} />
        </div>
      </div>
      <div className="evgrid">
        <div className="evmain">
          <EventNames ev={ev} E={E}>
            <ParamsCard ev={ev} E={E} />
            <IncomeCard ev={ev} E={E} />
            <LinesCard ev={ev} E={E} />
          </EventNames>
        </div>
        <aside className="evside">
          <CategoriesCard ev={ev} E={E} />
        </aside>
      </div>
    </>
  );
}
