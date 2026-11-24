import { useEffect } from 'react';
import { budgetStore, useBudgetStore } from './store';
import { Overlays } from './ui/components/Overlays';
import { Header } from './ui/layout/Header';
import { Ledger } from './ui/layout/Ledger';
import { Tabs } from './ui/layout/Tabs';
import { useRoute } from './ui/router';
import { EventView } from './ui/views/event/EventView';
import { Summary } from './ui/views/Summary';
import { ParamsView } from './ui/views/ParamsView';
import { SalaryView } from './ui/views/SalaryView';
import { PriorityView } from './ui/views/PriorityView';
import { DataView } from './ui/views/DataView';
import type { Route } from './ui/router';
import { useUndoKeys } from './ui/undo';

function View({ route }: { route: Route }) {
  switch (route.view) {
    case 'event':
      return <EventView key={route.evId} evId={route.evId} />;
    case 'params':
      return <ParamsView />;
    case 'salary':
      return <SalaryView />;
    case 'priority':
      return <PriorityView />;
    case 'data':
      return <DataView />;
    default:
      return <Summary />;
  }
}

export function App() {
  const loaded = useBudgetStore((s) => s.budget !== null);
  const route = useRoute();
  useUndoKeys();

  useEffect(() => {
    void budgetStore.getState().init();
  }, []);

  return (
    <div className="wrap">
      <Header />
      {loaded ? (
        <>
          <Ledger />
          <Tabs route={route} />
          <main id="main">
            <View route={route} />
          </main>
        </>
      ) : (
        <main>
          <p className="muted">טוען את התקציב...</p>
        </main>
      )}
      <footer className="foot">הנתונים שמורים רק בדפדפן הזה. מומלץ לייצא גיבוי מדי פעם.</footer>
      <Overlays />
    </div>
  );
}
