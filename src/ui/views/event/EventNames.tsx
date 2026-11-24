/** Provides the names a formula in this event can use, for autocomplete in its value fields. */
import { useMemo, type ReactNode } from 'react';
import { SALARY_LEVEL_KEY } from '../../../domain/compute';
import { FUNCTION_NAMES } from '../../../domain/formula';
import type { BudgetEvent, EventResult } from '../../../domain/types';
import { useBudgetStore } from '../../../store';
import { FormulaNamesContext, FUNCTION_HINTS, type Suggestion } from '../../autocomplete';
import { fmtS } from '../../format';

export function EventNames({ ev, E, children }: { ev: BudgetEvent; E: EventResult; children: ReactNode }) {
  const globals = useBudgetStore((s) => s.budget!.globals);
  const prices = useBudgetStore((s) => s.budget!.prices);
  const names = useMemo<Suggestion[]>(
    () => [
      ...ev.params.map((p): Suggestion => ({ name: p.key, kind: 'param', hint: E.params[p.id]?.err ? '⚠ שגיאה' : '= ' + fmtS(E.params[p.id]?.v) })),
      ...Object.keys(globals)
        .filter((k) => k !== SALARY_LEVEL_KEY)
        .map((k): Suggestion => ({ name: k, kind: 'global', hint: 'פרמטר כללי' })),
      ...prices.map((p): Suggestion => ({ name: p.key, kind: 'price', hint: p.label || 'מחירון' })),
      ...FUNCTION_NAMES.map((f): Suggestion => ({ name: f, kind: 'fn', hint: FUNCTION_HINTS[f] ?? 'פונקציה' })),
    ],
    [ev.params, E.params, globals, prices],
  );
  return <FormulaNamesContext.Provider value={names}>{children}</FormulaNamesContext.Provider>;
}
