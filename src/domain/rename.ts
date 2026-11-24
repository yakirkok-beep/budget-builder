/**
 * Renaming variables (CLAUDE.md section 6, "שינוי שם").
 *
 * - Param key: replace in all formulas of the same event (params, lines, income) and in partKey.
 * - Price key: replace in all formulas of all events.
 * - Salary row name: replace the argument of שכר("...") in all formulas of all events.
 * Only whole-name matches (Unicode word boundaries), only inside formulas,
 * and names are never replaced inside "string literals" (e.g. שכר("...")).
 *
 * Functions here mutate the given budget, so they work on plain objects and on immer drafts.
 */

import { NAME_RE, referencedNames } from './formula';
import type { Budget, BudgetEvent } from './types';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const identRe = (key: string): RegExp =>
  new RegExp('(?<![\\p{L}\\p{N}_])' + escapeRe(key) + '(?![\\p{L}\\p{N}_])', 'gu');

/** Replace a whole identifier in one formula string, skipping string literals. Non-formulas are returned as is. */
export function replaceIdent<T>(value: T, oldKey: string, newKey: string): T {
  if (typeof value !== 'string' || !value.trim().startsWith('=')) return value;
  const re = identRe(oldKey);
  // Split into [code, "literal", code, "literal", ...]; only code parts are rewritten.
  const parts = value.split(/("[^"]*")/);
  return parts.map((part, i) => (i % 2 === 1 ? part : part.replace(re, () => newKey))).join('') as T;
}

/** Apply fn to every formula-capable field of an event. */
function mapFields(ev: BudgetEvent, fn: <T>(v: T) => T): void {
  for (const p of ev.params) p.value = fn(p.value);
  for (const l of ev.lines) {
    l.qty = fn(l.qty);
    l.days = fn(l.days);
    l.price = fn(l.price);
  }
  for (const i of ev.income) {
    i.qty = fn(i.qty);
    i.price = fn(i.price);
  }
}

/** All formula-capable field values of an event. */
function fieldsOf(ev: BudgetEvent): unknown[] {
  return [
    ...ev.params.map((p) => p.value),
    ...ev.lines.flatMap((l) => [l.qty, l.days, l.price]),
    ...ev.income.flatMap((i) => [i.qty, i.price]),
  ];
}

function renameInEvent(ev: BudgetEvent, oldKey: string, newKey: string): void {
  mapFields(ev, (v) => replaceIdent(v, oldKey, newKey));
}

const salaryRefRe = (name: string): RegExp =>
  new RegExp('(?<![\\p{L}\\p{N}_])(שכר\\s*\\(\\s*)"' + escapeRe(name) + '"(\\s*\\))', 'gu');

/** Replace the row name inside שכר("...") calls of one formula. Non-formulas are returned as is. */
export function replaceSalaryRef<T>(value: T, oldName: string, newName: string): T {
  if (typeof value !== 'string' || !value.trim().startsWith('=')) return value;
  return value.replace(salaryRefRe(oldName), (_m, a: string, b: string) => a + '"' + newName + '"' + b) as T;
}

/** How many formula fields (in all events) use a name: a price key or a global. */
export function countNameUses(budget: Budget, name: string): number {
  return budget.events.reduce((n, ev) => n + fieldsOf(ev).filter((v) => referencedNames(v).includes(name)).length, 0);
}

/** How many formula fields (in all events) call שכר("name"). */
export function countSalaryUses(budget: Budget, name: string): number {
  const re = salaryRefRe(name);
  return budget.events.reduce(
    (n, ev) => n + fieldsOf(ev).filter((v) => typeof v === 'string' && v.trim().startsWith('=') && v.search(re) >= 0).length,
    0,
  );
}

/** Clean what the user typed into a valid name: trim, spaces to underscores, drop quotes. */
export function normalizeKey(raw: string): string {
  return String(raw).trim().replace(/\s+/g, '_').replace(/["'״׳]/g, '');
}

export const isValidKey = (key: string): boolean => NAME_RE.test(key);

export type RenameResult = { ok: true; key: string } | { ok: false; error: string };

const INVALID_KEY = 'שם יכול לכלול אותיות, ספרות וקו תחתון, ולהתחיל באות';

/** Rename an event param and update every formula in that event (and partKey). */
export function renameParam(budget: Budget, evId: string, paramId: string, rawKey: string): RenameResult {
  const ev = budget.events.find((e) => e.id === evId);
  const param = ev?.params.find((p) => p.id === paramId);
  if (!ev || !param) return { ok: false, error: 'הפרמטר לא נמצא' };
  const key = normalizeKey(rawKey);
  if (!isValidKey(key)) return { ok: false, error: INVALID_KEY };
  const old = param.key;
  if (key === old) return { ok: true, key };
  if (ev.params.some((p) => p.id !== paramId && p.key === key)) return { ok: false, error: 'כבר יש פרמטר בשם הזה' };
  param.key = key;
  if (old) {
    renameInEvent(ev, old, key);
    if (ev.partKey === old) ev.partKey = key;
  }
  return { ok: true, key };
}

/** Rename a price key and update every formula in every event. */
export function renamePrice(budget: Budget, priceId: string, rawKey: string): RenameResult {
  const price = budget.prices.find((p) => p.id === priceId);
  if (!price) return { ok: false, error: 'הפריט לא נמצא' };
  const key = normalizeKey(rawKey);
  if (!isValidKey(key)) return { ok: false, error: INVALID_KEY };
  const old = price.key;
  if (key === old) return { ok: true, key };
  if (budget.prices.some((p) => p.id !== priceId && p.key === key)) return { ok: false, error: 'כבר יש פריט במחירון בשם הזה' };
  price.key = key;
  if (old) for (const ev of budget.events) renameInEvent(ev, old, key);
  return { ok: true, key };
}

/** Rename a category and move all its lines with it (lines link to categories by name). */
export function renameCategory(budget: Budget, evId: string, catId: string, rawName: string): RenameResult {
  const ev = budget.events.find((e) => e.id === evId);
  const cat = ev?.cats.find((c) => c.id === catId);
  if (!ev || !cat) return { ok: false, error: 'הקטגוריה לא נמצאה' };
  const name = String(rawName).trim();
  if (!name) return { ok: false, error: 'לקטגוריה צריך שם' };
  const old = cat.name;
  if (name === old) return { ok: true, key: name };
  if (ev.cats.some((c) => c.id !== catId && c.name === name)) return { ok: false, error: 'כבר יש קטגוריה בשם הזה' };
  cat.name = name;
  if (!cat.blat) for (const l of ev.lines) if (l.cat === old) l.cat = name;
  return { ok: true, key: name };
}

/** Rename a salary row and update every שכר("old") call in every event. */
export function renameSalaryRow(budget: Budget, rowId: string, rawName: string): RenameResult {
  const row = budget.salary.find((r) => r.id === rowId);
  if (!row) return { ok: false, error: 'שורת השכר לא נמצאה' };
  const name = String(rawName).trim();
  if (!name) return { ok: false, error: 'לשורה צריך שם' };
  if (name.includes('"')) return { ok: false, error: 'השם לא יכול לכלול מירכאות' };
  const old = row.name;
  if (name === old) return { ok: true, key: name };
  if (budget.salary.some((r) => r.id !== rowId && r.name === name)) return { ok: false, error: 'כבר יש שורה בשם הזה' };
  row.name = name;
  if (old) for (const ev of budget.events) mapFields(ev, (v) => replaceSalaryRef(v, old, name));
  return { ok: true, key: name };
}
