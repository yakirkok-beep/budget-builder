/**
 * Editing operations on a Budget. Pure logic, no React.
 * Every function mutates the budget it gets, so it works on immer drafts (the store)
 * and on plain objects (tests). Ported from ACTIONS in reference/prototype.html.
 */

import { normalizeInput } from './formula';
import { clone, newId, reid } from './templates';
import type { Budget, BudgetEvent, Category, ExpenseLine, IncomeLine, Level, Param, Period, Price, SalaryRow, Val } from './types';

/** Store numbers as numbers ("1,200" -> 1200), keep formulas and empty as is. */
export const toVal = (v: Val): Val => (typeof v === 'number' ? v : normalizeInput(v));

const findEvent = (b: Budget, evId: string): BudgetEvent => {
  const ev = b.events.find((e) => e.id === evId);
  if (!ev) throw new Error('המפעל לא נמצא: ' + evId);
  return ev;
};

const findIn = <T extends { id: string }>(list: T[], id: string, what: string): T => {
  const x = list.find((i) => i.id === id);
  if (!x) throw new Error(what + ' לא נמצא: ' + id);
  return x;
};

const removeFrom = <T extends { id: string }>(list: T[], id: string): void => {
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
};

/** "base", then "base_2", "base_3"... (or with a space) until unused. */
const uniqueName = (base: string, taken: (n: string) => boolean, sep = '_'): string => {
  let n = base;
  let i = 1;
  while (taken(n)) n = base + sep + ++i;
  return n;
};

/* ------------------------------ budget ------------------------------ */

export function setBudgetName(b: Budget, name: string): void {
  b.name = name;
}

export function setGlobal(b: Budget, key: string, value: Val): void {
  b.globals[key] = key === 'רמת_שכר' ? String(value) : toVal(value);
}

/* ------------------------------ prices ------------------------------ */

export function addPrice(b: Budget): string {
  const key = uniqueName('מחיר_חדש', (k) => b.prices.some((p) => p.key === k));
  const p: Price = { id: newId(b, 'r'), key, label: '', value: 0, unit: '' };
  b.prices.push(p);
  return p.id;
}

export function setPriceField(b: Budget, id: string, field: 'label' | 'unit' | 'value', value: Val): void {
  const p = findIn(b.prices, id, 'פריט');
  if (field === 'value') p.value = toVal(value);
  else p[field] = String(value);
}

export function deletePrice(b: Budget, id: string): void {
  removeFrom(b.prices, id);
}

/* ------------------------------ salary ------------------------------ */

export function addSalaryRow(b: Budget): string {
  const name = uniqueName('אירוע חדש', (n) => b.salary.some((r) => r.name === n), ' ');
  const s: SalaryRow = { id: newId(b, 's'), name, hours: '', levels: { מתחיל: '', בכיר: '', ותיק: '', רביעי: '' }, note: '' };
  b.salary.push(s);
  return s.id;
}

export function setSalaryField(b: Budget, id: string, field: 'name' | 'note' | 'hours', value: Val): void {
  const s = findIn(b.salary, id, 'שורת שכר');
  if (field === 'hours') s.hours = toVal(value);
  else s[field] = String(value);
}

export function setSalaryLevel(b: Budget, id: string, level: Level, value: Val): void {
  findIn(b.salary, id, 'שורת שכר').levels[level] = toVal(value);
}

export function deleteSalaryRow(b: Budget, id: string): void {
  removeFrom(b.salary, id);
}

/* ------------------------------ events ------------------------------ */

export type EventField = 'name' | 'sub' | 'active' | 'partKey' | 'incCode';

export function setEventField(b: Budget, evId: string, field: EventField, value: string | boolean | null): void {
  const ev = findEvent(b, evId);
  if (field === 'active') ev.active = Boolean(value);
  else if (field === 'partKey') ev.partKey = value ? String(value) : null;
  else if (field === 'incCode') ev.incCode = value ? String(value) : '';
  else ev[field] = String(value ?? '');
}

/** Copy an event right after the original. Returns the new id. */
export function duplicateEvent(b: Budget, evId: string): string {
  const src = findEvent(b, evId);
  const copy = reid(b, clone(src));
  copy.name = src.name + ' (עותק)';
  b.events.splice(b.events.indexOf(src) + 1, 0, copy);
  return copy.id;
}

export function deleteEvent(b: Budget, evId: string): void {
  removeFrom(b.events, evId);
}

export function moveEvent(b: Budget, evId: string, delta: number): void {
  const i = b.events.findIndex((e) => e.id === evId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= b.events.length) return;
  const [ev] = b.events.splice(i, 1);
  b.events.splice(j, 0, ev!);
}

/* ------------------------------ params ------------------------------ */

export function addParam(b: Budget, evId: string): string {
  const ev = findEvent(b, evId);
  const key = uniqueName('פרמטר_חדש', (k) => ev.params.some((p) => p.key === k));
  const p: Param = { id: newId(b, 'p'), key, value: 0, note: '' };
  ev.params.push(p);
  return p.id;
}

export function setParamField(b: Budget, evId: string, id: string, field: 'value' | 'note', value: Val): void {
  const p = findIn(findEvent(b, evId).params, id, 'פרמטר');
  if (field === 'value') p.value = toVal(value);
  else p.note = String(value);
}

export function deleteParam(b: Budget, evId: string, id: string): void {
  const ev = findEvent(b, evId);
  const p = ev.params.find((x) => x.id === id);
  removeFrom(ev.params, id);
  if (p && ev.partKey === p.key) ev.partKey = null;
}

/* ------------------------------ income ------------------------------ */

export function addIncome(b: Budget, evId: string): string {
  const i: IncomeLine = { id: newId(b, 'i'), label: '', qty: '', price: '', note: '' };
  findEvent(b, evId).income.push(i);
  return i.id;
}

export function setIncomeField(b: Budget, evId: string, id: string, field: 'label' | 'note' | 'qty' | 'price', value: Val): void {
  const i = findIn(findEvent(b, evId).income, id, 'שורת הכנסה');
  if (field === 'qty' || field === 'price') i[field] = toVal(value);
  else i[field] = String(value);
}

export function deleteIncome(b: Budget, evId: string, id: string): void {
  removeFrom(findEvent(b, evId).income, id);
}

/* ------------------------------ lines ------------------------------ */

/**
 * Add an expense line. Default category: the given one, else the first regular category.
 * The line goes right after the last line of its category (as in the prototype).
 */
export function addLine(b: Budget, evId: string, cat?: string): string {
  const ev = findEvent(b, evId);
  const c = cat ?? ev.cats.find((x) => !x.blat)?.name ?? '';
  const l: ExpenseLine = { id: newId(b, 'l'), cat: c, item: '', qty: 1, days: 1, price: '', note: '' };
  const idx = ev.lines.map((x) => x.cat).lastIndexOf(c);
  if (idx >= 0) ev.lines.splice(idx + 1, 0, l);
  else ev.lines.push(l);
  return l.id;
}

export function setLineField(
  b: Budget,
  evId: string,
  id: string,
  field: 'cat' | 'item' | 'note' | 'qty' | 'days' | 'price',
  value: Val,
): void {
  const l = findIn(findEvent(b, evId).lines, id, 'שורה');
  if (field === 'qty' || field === 'days' || field === 'price') l[field] = toVal(value);
  else l[field] = String(value);
}

export function deleteLine(b: Budget, evId: string, id: string): void {
  removeFrom(findEvent(b, evId).lines, id);
}

/* ---------------------------- categories ---------------------------- */

/** New regular category, placed before the blat category, with the first category's period. */
export function addCategory(b: Budget, evId: string): string {
  const ev = findEvent(b, evId);
  const name = uniqueName('קטגוריה חדשה', (n) => ev.cats.some((c) => c.name === n), ' ');
  const c: Category = { id: newId(b, 'c'), name, code: '', period: ev.cats[0]?.period ?? '', blat: false, plan: null, act: null };
  const bi = ev.cats.findIndex((x) => x.blat);
  if (bi >= 0) ev.cats.splice(bi, 0, c);
  else ev.cats.push(c);
  return c.id;
}

/** Add a computed contingency category (and the אחוז_בלתם param if missing). */
export function addBlatCategory(b: Budget, evId: string): string {
  const ev = findEvent(b, evId);
  const c: Category = { id: newId(b, 'c'), name: 'בלת"ם', code: '', period: ev.cats[0]?.period ?? '', blat: true, plan: null, act: null };
  ev.cats.push(c);
  if (!ev.params.some((p) => p.key === 'אחוז_בלתם')) ev.params.push({ id: newId(b, 'p'), key: 'אחוז_בלתם', value: '=בלתם', note: '' });
  return c.id;
}

export function setCategoryField(
  b: Budget,
  evId: string,
  id: string,
  field: 'code' | 'period' | 'plan' | 'act',
  value: string | number | null,
): void {
  const c = findIn(findEvent(b, evId).cats, id, 'קטגוריה');
  if (field === 'code') c.code = String(value ?? '').trim();
  else if (field === 'period') c.period = toPeriod(value);
  else {
    const n = value === '' || value == null ? null : Number(String(value).replace(/[,₪\s]/g, ''));
    c[field] = n != null && isFinite(n) ? n : null;
  }
}

export function toPeriod(v: unknown): Period {
  if (v === 'שנתי') return 'שנתי';
  const n = Number(v);
  return v !== '' && v != null && Number.isInteger(n) && n >= 1 && n <= 12 ? n : '';
}

/** Lines of the category that would become uncategorized if it is deleted. */
export function linesInCategory(b: Budget, evId: string, id: string): number {
  const ev = findEvent(b, evId);
  const c = ev.cats.find((x) => x.id === id);
  if (!c || c.blat) return 0;
  return ev.lines.filter((l) => l.cat === c.name).length;
}

/** Delete a category. Its lines stay, keep their old category name, and show as "ללא קטגוריה". */
export function deleteCategory(b: Budget, evId: string, id: string): void {
  removeFrom(findEvent(b, evId).cats, id);
}
