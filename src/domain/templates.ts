/**
 * New event templates (CLAUDE.md section 8, "מפעל חדש") and id helpers.
 * Ported from openAddEvent() / reid() in reference/prototype.html.
 */

import type { Budget, BudgetEvent, Category } from './types';

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/** Next ASCII id with a prefix (e376, l42...). Mutates budget.nextId. */
export function newId(budget: Budget, prefix: string): string {
  budget.nextId = (budget.nextId || 1000) + 1;
  return prefix + budget.nextId;
}

/** Give an event and all its rows fresh ids. */
export function reid(budget: Budget, ev: BudgetEvent): BudgetEvent {
  ev.id = 'e' + newId(budget, '');
  for (const p of ev.params) p.id = newId(budget, 'p');
  for (const i of ev.income) i.id = newId(budget, 'i');
  for (const l of ev.lines) l.id = newId(budget, 'l');
  for (const c of ev.cats) c.id = newId(budget, 'c');
  return ev;
}

export const TEMPLATE_EVENT_IDS = { weekend: 'wkb', seminar: 'semb' } as const;

export type EventSource = { kind: 'blank' } | { kind: 'weekend' } | { kind: 'seminar' } | { kind: 'copy'; evId: string };

const BLANK_CATS = ['אש"ל', 'תחבורה', 'אבטחה', 'שכר', 'הדרכה', 'ציוד'];

const emptyCat = (name: string, blat = false): Category => ({ id: '', name, code: '', period: '', blat, plan: null, act: null });

export function blankEvent(name: string): BudgetEvent {
  return {
    id: '',
    name,
    active: true,
    sub: '',
    partKey: 'משתתפים',
    incCode: '',
    notes: [],
    params: [
      { id: '', key: 'משתתפים', value: 100, note: '' },
      { id: '', key: 'אחוז_בלתם', value: '=בלתם', note: '' },
    ],
    income: [{ id: '', label: 'דמי השתתפות', qty: '=משתתפים', price: 0, note: '' }],
    lines: [{ id: '', cat: 'אש"ל', item: 'אש"ל למשתתף', qty: '=משתתפים', days: 1, price: 0, note: '' }],
    cats: [...BLANK_CATS.map((n) => emptyCat(n)), emptyCat('בלת"ם', true)],
  };
}

/** Clear 2026 comparison data and notes (used for templates). */
export function resetComparison(ev: BudgetEvent): void {
  for (const c of ev.cats) {
    c.plan = null;
    c.act = null;
  }
  ev.incPlan = null;
  ev.incAct = null;
  ev.notes = [];
}

/**
 * Create a new event (not yet added to the budget).
 * Templates come from the seed, not from the open budget.
 * Throws if a copy source does not exist.
 */
export function createEvent(budget: Budget, seed: Budget, source: EventSource, name: string): BudgetEvent {
  let ev: BudgetEvent;
  if (source.kind === 'copy') {
    const src = budget.events.find((e) => e.id === source.evId);
    if (!src) throw new Error('המפעל להעתקה לא נמצא');
    ev = clone(src);
  } else if (source.kind === 'blank') {
    ev = blankEvent(name);
  } else {
    const tpl = seed.events.find((e) => e.id === TEMPLATE_EVENT_IDS[source.kind]);
    ev = tpl ? clone(tpl) : blankEvent(name);
    resetComparison(ev);
  }
  if (source.kind !== 'copy') ev.sub = '';
  reid(budget, ev);
  ev.name = name.trim() || 'מפעל חדש';
  ev.active = true;
  return ev;
}

/** Create and append a new event. Returns its id. */
export function addEvent(budget: Budget, seed: Budget, source: EventSource, name: string): string {
  const ev = createEvent(budget, seed, source, name);
  budget.events.push(ev);
  return ev.id;
}
