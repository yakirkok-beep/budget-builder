/**
 * Copy, paste, move and duplicate any element (expense and income lines, whole categories,
 * params, events, price-list items, salary rows), by click or by drag.
 *
 * A copy takes along what its formulas need: event params (and the params those use),
 * price-list items and salary rows (שכר("...")). Pasting adds whatever is missing in the target,
 * so the pasted rows keep working in another event, or another budget.
 *
 * Pure logic, no React. Functions mutate the budget they get (immer drafts in the store,
 * plain objects in tests) and return what they did, in short Hebrew notes for the user.
 */
import { uniqueName } from './edit';
import { referencedNames } from './formula';
import { clone, newId, reid } from './templates';
import type { Budget, BudgetEvent, Category, ExpenseLine, IncomeLine, Param, Price, SalaryRow } from './types';

export interface Deps {
  params: Param[];
  prices: Price[];
  salary: SalaryRow[];
}

export type Clip =
  | { kind: 'lines'; items: ExpenseLine[]; cats: Category[]; deps: Deps; from: string }
  | { kind: 'income'; items: IncomeLine[]; deps: Deps; from: string }
  | { kind: 'params'; items: Param[]; deps: Deps; from: string }
  | { kind: 'category'; cat: Category; items: ExpenseLine[]; deps: Deps; from: string }
  | { kind: 'event'; event: BudgetEvent; deps: Deps; from: string }
  | { kind: 'prices'; items: Price[]; from: string }
  | { kind: 'salary'; items: SalaryRow[]; from: string };

export type ClipKind = Clip['kind'];

export interface PasteResult {
  /** ids of the new (or overwritten) items */
  ids: string[];
  /** what else happened, for a toast */
  notes: string[];
}

/** Paste a params / prices / salary clip over items with the same name, or skip them. */
export type ConflictMode = 'skip' | 'overwrite';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const findEvent = (b: Budget, evId: string): BudgetEvent => {
  const ev = b.events.find((e) => e.id === evId);
  if (!ev) throw new Error('המפעל לא נמצא: ' + evId);
  return ev;
};

const pick = <T extends { id: string }>(list: T[], ids: string[]): T[] => list.filter((x) => ids.includes(x.id));

const SALARY_RE = /(?<![\p{L}\p{N}_])שכר\s*\(\s*"([^"]*)"\s*\)/gu;
const salaryRefs = (v: unknown): string[] =>
  typeof v === 'string' && v.trim().startsWith('=') ? [...v.matchAll(SALARY_RE)].map((m) => m[1]!) : [];

const lineValues = (l: ExpenseLine): unknown[] => [l.qty, l.days, l.price];
const incomeValues = (i: IncomeLine): unknown[] => [i.qty, i.price];

/** What the given formula values need: params of the event (transitively), prices, salary rows. */
function collectDeps(b: Budget, ev: BudgetEvent | null, values: unknown[], exclude: string[] = []): Deps {
  const paramByKey = new Map(ev ? ev.params.map((p) => [p.key, p] as const) : []);
  const names = new Set<string>();
  const salaryNames = new Set<string>();
  const usedParams = new Set<string>();
  const visit = (v: unknown): void => {
    salaryRefs(v).forEach((s) => salaryNames.add(s));
    for (const n of referencedNames(v)) {
      const p = paramByKey.get(n);
      if (p) {
        if (!usedParams.has(n)) {
          usedParams.add(n);
          visit(p.value);
        }
      } else names.add(n);
    }
  };
  values.forEach(visit);
  return clone({
    params: ev ? ev.params.filter((p) => usedParams.has(p.key) && !exclude.includes(p.key)) : [],
    prices: b.prices.filter((p) => names.has(p.key) && !(p.key in b.globals)),
    salary: b.salary.filter((r) => salaryNames.has(r.name)),
  });
}

const list = (xs: string[]): string => xs.join(', ');

/** Add whatever the pasted rows need and the target lacks. */
function ensureDeps(b: Budget, ev: BudgetEvent | null, deps: Deps, notes: string[]): void {
  const prices: string[] = [];
  for (const p of deps.prices) {
    if (!b.prices.some((x) => x.key === p.key)) {
      b.prices.push({ ...clone(p), id: newId(b, 'r') });
      prices.push(p.key);
    }
  }
  if (prices.length) notes.push('נוספו למחירון: ' + list(prices));

  const salary: string[] = [];
  for (const r of deps.salary) {
    if (!b.salary.some((x) => x.name === r.name)) {
      b.salary.push({ ...clone(r), id: newId(b, 's') });
      salary.push(r.name);
    }
  }
  if (salary.length) notes.push('נוספו לטבלת השכר: ' + list(salary));

  if (!ev) return;
  const added: string[] = [];
  const differs: string[] = [];
  for (const p of deps.params) {
    const existing = ev.params.find((x) => x.key === p.key);
    if (!existing) {
      ev.params.push({ ...clone(p), id: newId(b, 'p') });
      added.push(p.key);
    } else if (String(existing.value) !== String(p.value)) differs.push(p.key);
  }
  if (added.length) notes.push('נוספו פרמטרים: ' + list(added));
  if (differs.length) notes.push('בשימוש הערכים של המפעל הזה: ' + list(differs));
}

/** Make sure a regular category with this name exists (taking code and period from the source if known). */
function ensureCategory(b: Budget, ev: BudgetEvent, name: string, source: Category[], notes: string[]): void {
  if (!name || ev.cats.some((c) => !c.blat && c.name === name)) return;
  const src = source.find((c) => c.name === name && !c.blat);
  const cat: Category = { id: newId(b, 'c'), name, code: src?.code ?? '', period: src?.period ?? '', blat: false, plan: null, act: null };
  const bi = ev.cats.findIndex((c) => c.blat);
  if (bi >= 0) ev.cats.splice(bi, 0, cat);
  else ev.cats.push(cat);
  notes.push('נוספה קטגוריה: ' + name);
}

/** Index to insert lines of a category: right after its last line (or at the end). */
function lineInsertIndex(ev: BudgetEvent, cat: string, beforeId?: string | null): number {
  if (beforeId) {
    const i = ev.lines.findIndex((l) => l.id === beforeId);
    if (i >= 0) return i;
  }
  const last = ev.lines.map((l) => l.cat).lastIndexOf(cat);
  return last >= 0 ? last + 1 : ev.lines.length;
}

/** Move an item inside its list: before another item, or to the end (beforeId null). */
export function moveItem<T extends { id: string }>(xs: T[], id: string, beforeId: string | null): void {
  if (id === beforeId) return;
  const from = xs.findIndex((x) => x.id === id);
  if (from < 0) return;
  const [item] = xs.splice(from, 1);
  const to = beforeId === null ? xs.length : xs.findIndex((x) => x.id === beforeId);
  xs.splice(to < 0 ? xs.length : to, 0, item!);
}

/* ------------------------------------------------------------------ */
/* copy                                                                */
/* ------------------------------------------------------------------ */

export function copyLines(b: Budget, evId: string, ids: string[]): Clip {
  const ev = findEvent(b, evId);
  const items = clone(pick(ev.lines, ids));
  return { kind: 'lines', items, cats: clone(ev.cats.filter((c) => items.some((l) => l.cat === c.name))), deps: collectDeps(b, ev, items.flatMap(lineValues)), from: ev.name };
}

export function copyIncome(b: Budget, evId: string, ids: string[]): Clip {
  const ev = findEvent(b, evId);
  const items = clone(pick(ev.income, ids));
  return { kind: 'income', items, deps: collectDeps(b, ev, items.flatMap(incomeValues)), from: ev.name };
}

export function copyParams(b: Budget, evId: string, ids: string[]): Clip {
  const ev = findEvent(b, evId);
  const items = clone(pick(ev.params, ids));
  return { kind: 'params', items, deps: collectDeps(b, ev, items.map((p) => p.value), items.map((p) => p.key)), from: ev.name };
}

export function copyCategory(b: Budget, evId: string, catId: string): Clip {
  const ev = findEvent(b, evId);
  const cat = ev.cats.find((c) => c.id === catId);
  if (!cat) throw new Error('הקטגוריה לא נמצאה');
  const items = cat.blat ? [] : clone(ev.lines.filter((l) => l.cat === cat.name));
  const values = items.flatMap(lineValues);
  if (cat.blat) values.push('=' + 'אחוז_בלתם');
  return { kind: 'category', cat: clone(cat), items, deps: collectDeps(b, ev, values), from: ev.name };
}

export function copyEvent(b: Budget, evId: string): Clip {
  const ev = findEvent(b, evId);
  const values = [...ev.params.map((p) => p.value), ...ev.lines.flatMap(lineValues), ...ev.income.flatMap(incomeValues)];
  const deps = collectDeps(b, ev, values);
  deps.params = []; // the event carries its own params
  return { kind: 'event', event: clone(ev), deps, from: b.name };
}

export function copyPrices(b: Budget, ids: string[]): Clip {
  return { kind: 'prices', items: clone(pick(b.prices, ids)), from: b.name };
}

export function copySalary(b: Budget, ids: string[]): Clip {
  return { kind: 'salary', items: clone(pick(b.salary, ids)), from: b.name };
}

/** Short description of a clip, for the clipboard bar. */
export function describeClip(c: Clip): string {
  const n = (count: number, one: string, many: string): string => (count === 1 ? one : `${count} ${many}`);
  switch (c.kind) {
    case 'lines':
      return n(c.items.length, 'שורת הוצאה', 'שורות הוצאה') + ' מ' + c.from;
    case 'income':
      return n(c.items.length, 'שורת הכנסה', 'שורות הכנסה') + ' מ' + c.from;
    case 'params':
      return n(c.items.length, 'פרמטר', 'פרמטרים') + ' מ' + c.from;
    case 'category':
      return `הקטגוריה "${c.cat.name}" מ${c.from}`;
    case 'event':
      return `המפעל "${c.event.name}"`;
    case 'prices':
      return n(c.items.length, 'פריט מחירון', 'פריטי מחירון');
    case 'salary':
      return n(c.items.length, 'שורת שכר', 'שורות שכר');
  }
}

/* ------------------------------------------------------------------ */
/* paste                                                               */
/* ------------------------------------------------------------------ */

/** Names that already exist in the target and would be skipped or overwritten. */
export function pasteConflicts(b: Budget, clip: Clip, evId?: string): string[] {
  if (clip.kind === 'params' && evId) {
    const ev = findEvent(b, evId);
    return clip.items.filter((p) => ev.params.some((x) => x.key === p.key)).map((p) => p.key);
  }
  if (clip.kind === 'prices') return clip.items.filter((p) => b.prices.some((x) => x.key === p.key)).map((p) => p.key);
  if (clip.kind === 'salary') return clip.items.filter((r) => b.salary.some((x) => x.name === r.name)).map((r) => r.name);
  return [];
}

/** Expense lines into an event: into a category (cat), before a line (beforeId), or each to its own category. */
export function pasteLines(b: Budget, evId: string, clip: Extract<Clip, { kind: 'lines' }>, opts: { cat?: string; beforeId?: string | null } = {}): PasteResult {
  const ev = findEvent(b, evId);
  const notes: string[] = [];
  ensureDeps(b, ev, clip.deps, notes);
  const ids: string[] = [];
  const fresh = clip.items.map((src) => {
    const l: ExpenseLine = { ...clone(src), id: newId(b, 'l') };
    if (opts.cat !== undefined) l.cat = opts.cat;
    ensureCategory(b, ev, l.cat, clip.cats, notes);
    ids.push(l.id);
    return l;
  });
  if (opts.beforeId || opts.cat !== undefined) {
    ev.lines.splice(lineInsertIndex(ev, opts.cat ?? fresh[0]?.cat ?? '', opts.beforeId), 0, ...fresh);
  } else {
    for (const l of fresh) ev.lines.splice(lineInsertIndex(ev, l.cat), 0, l);
  }
  return { ids, notes };
}

export function pasteIncome(b: Budget, evId: string, clip: Extract<Clip, { kind: 'income' }>, beforeId: string | null = null): PasteResult {
  const ev = findEvent(b, evId);
  const notes: string[] = [];
  ensureDeps(b, ev, clip.deps, notes);
  const fresh = clip.items.map((src) => ({ ...clone(src), id: newId(b, 'i') }));
  const at = beforeId ? ev.income.findIndex((i) => i.id === beforeId) : -1;
  ev.income.splice(at >= 0 ? at : ev.income.length, 0, ...fresh);
  return { ids: fresh.map((i) => i.id), notes };
}

/** A whole category with its lines. Merges into a category with the same name if the event has one. */
export function pasteCategory(b: Budget, evId: string, clip: Extract<Clip, { kind: 'category' }>): PasteResult {
  const ev = findEvent(b, evId);
  const notes: string[] = [];
  ensureDeps(b, ev, clip.deps, notes);
  if (clip.cat.blat) {
    if (ev.cats.some((c) => c.blat)) return { ids: [], notes: ['במפעל הזה כבר יש בלת"ם מחושב'] };
    const cat: Category = { ...clone(clip.cat), id: newId(b, 'c'), plan: null, act: null };
    ev.cats.push(cat);
    return { ids: [cat.id], notes };
  }
  let target = ev.cats.find((c) => !c.blat && c.name === clip.cat.name);
  if (target) notes.push(`השורות נוספו לקטגוריה הקיימת "${target.name}"`);
  else {
    target = { ...clone(clip.cat), id: newId(b, 'c'), plan: null, act: null };
    const bi = ev.cats.findIndex((c) => c.blat);
    if (bi >= 0) ev.cats.splice(bi, 0, target);
    else ev.cats.push(target);
  }
  const fresh = clip.items.map((src) => ({ ...clone(src), id: newId(b, 'l'), cat: target!.name }));
  ev.lines.splice(lineInsertIndex(ev, target.name), 0, ...fresh);
  return { ids: [target.id, ...fresh.map((l) => l.id)], notes };
}

export function pasteParams(b: Budget, evId: string, clip: Extract<Clip, { kind: 'params' }>, mode: ConflictMode = 'skip'): PasteResult {
  const ev = findEvent(b, evId);
  const notes: string[] = [];
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const src of clip.items) {
    const existing = ev.params.find((p) => p.key === src.key);
    if (existing) {
      if (mode === 'overwrite') {
        existing.value = clone(src.value);
        existing.note = src.note;
        ids.push(existing.id);
      } else skipped.push(src.key);
    } else {
      const p = { ...clone(src), id: newId(b, 'p') };
      ev.params.push(p);
      ids.push(p.id);
    }
  }
  if (skipped.length) notes.push('לא הודבקו (כבר קיימים): ' + list(skipped));
  ensureDeps(b, ev, clip.deps, notes);
  return { ids, notes };
}

/** An event into this budget (also from another budget). */
export function pasteEvent(b: Budget, clip: Extract<Clip, { kind: 'event' }>): PasteResult {
  const notes: string[] = [];
  ensureDeps(b, null, clip.deps, notes);
  const ev = reid(b, clone(clip.event));
  if (b.events.some((e) => e.name === ev.name)) ev.name = ev.name + ' (עותק)';
  b.events.push(ev);
  return { ids: [ev.id], notes };
}

function pasteNamed<T extends { id: string }>(
  b: Budget,
  target: T[],
  items: T[],
  nameOf: (x: T) => string,
  prefix: string,
  mode: ConflictMode,
): PasteResult {
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const src of items) {
    const i = target.findIndex((x) => nameOf(x) === nameOf(src));
    if (i >= 0) {
      if (mode === 'overwrite') {
        target[i] = { ...clone(src), id: target[i]!.id };
        ids.push(target[i]!.id);
      } else skipped.push(nameOf(src));
    } else {
      const x = { ...clone(src), id: newId(b, prefix) };
      target.push(x);
      ids.push(x.id);
    }
  }
  return { ids, notes: skipped.length ? ['לא הודבקו (כבר קיימים): ' + list(skipped)] : [] };
}

export const pastePrices = (b: Budget, clip: Extract<Clip, { kind: 'prices' }>, mode: ConflictMode = 'skip'): PasteResult =>
  pasteNamed(b, b.prices, clip.items, (p) => p.key, 'r', mode);

export const pasteSalary = (b: Budget, clip: Extract<Clip, { kind: 'salary' }>, mode: ConflictMode = 'skip'): PasteResult =>
  pasteNamed(b, b.salary, clip.items, (r) => r.name, 's', mode);

/* ------------------------------------------------------------------ */
/* move inside an event, and between events                            */
/* ------------------------------------------------------------------ */

/** Move lines inside their event: into a category and/or before a line (null = end of that category). */
export function moveLines(b: Budget, evId: string, ids: string[], opts: { cat?: string; beforeId?: string | null }): void {
  const ev = findEvent(b, evId);
  const moving = ev.lines.filter((l) => ids.includes(l.id));
  if (!moving.length) return;
  if (opts.cat !== undefined) moving.forEach((l) => (l.cat = opts.cat!));
  ev.lines = ev.lines.filter((l) => !ids.includes(l.id));
  const cat = opts.cat ?? moving[0]!.cat;
  ev.lines.splice(lineInsertIndex(ev, cat, opts.beforeId && !ids.includes(opts.beforeId) ? opts.beforeId : null), 0, ...moving);
}

const reorder =
  <K extends 'params' | 'income' | 'cats'>(key: K) =>
  (b: Budget, evId: string, id: string, beforeId: string | null): void =>
    moveItem(findEvent(b, evId)[key] as { id: string }[], id, beforeId);

export const moveParam = reorder('params');
export const moveIncome = reorder('income');
export const moveCategory = reorder('cats');
export const moveEventTo = (b: Budget, id: string, beforeId: string | null): void => moveItem(b.events, id, beforeId);
export const movePrice = (b: Budget, id: string, beforeId: string | null): void => moveItem(b.prices, id, beforeId);
export const moveSalaryRow = (b: Budget, id: string, beforeId: string | null): void => moveItem(b.salary, id, beforeId);

/** Move lines to another event (copy there with what they need, then remove here). */
export function transferLines(b: Budget, fromEvId: string, ids: string[], toEvId: string, opts: { cat?: string } = {}): PasteResult {
  if (fromEvId === toEvId) {
    moveLines(b, fromEvId, ids, opts);
    return { ids, notes: [] };
  }
  const clip = copyLines(b, fromEvId, ids) as Extract<Clip, { kind: 'lines' }>;
  const res = pasteLines(b, toEvId, clip, opts);
  const from = findEvent(b, fromEvId);
  from.lines = from.lines.filter((l) => !ids.includes(l.id));
  return res;
}

export function transferIncome(b: Budget, fromEvId: string, ids: string[], toEvId: string): PasteResult {
  if (fromEvId === toEvId) return { ids, notes: [] };
  const res = pasteIncome(b, toEvId, copyIncome(b, fromEvId, ids) as Extract<Clip, { kind: 'income' }>);
  const from = findEvent(b, fromEvId);
  from.income = from.income.filter((i) => !ids.includes(i.id));
  return res;
}

/** Move a whole category with its lines to another event. */
export function transferCategory(b: Budget, fromEvId: string, catId: string, toEvId: string): PasteResult {
  if (fromEvId === toEvId) return { ids: [catId], notes: [] };
  const from = findEvent(b, fromEvId);
  const cat = from.cats.find((c) => c.id === catId);
  if (!cat) throw new Error('הקטגוריה לא נמצאה');
  const res = pasteCategory(b, toEvId, copyCategory(b, fromEvId, catId) as Extract<Clip, { kind: 'category' }>);
  if (!cat.blat) from.lines = from.lines.filter((l) => l.cat !== cat.name);
  from.cats = from.cats.filter((c) => c.id !== catId);
  return res;
}

/* ------------------------------------------------------------------ */
/* duplicate in place                                                  */
/* ------------------------------------------------------------------ */

/** Each copy goes right after its source line. */
export function duplicateLines(b: Budget, evId: string, ids: string[]): string[] {
  const ev = findEvent(b, evId);
  const out: string[] = [];
  for (const id of ids) {
    const i = ev.lines.findIndex((l) => l.id === id);
    if (i < 0) continue;
    const copy = { ...clone(ev.lines[i]!), id: newId(b, 'l') };
    ev.lines.splice(i + 1, 0, copy);
    out.push(copy.id);
  }
  return out;
}

export function duplicateIncome(b: Budget, evId: string, id: string): string {
  const ev = findEvent(b, evId);
  const i = ev.income.findIndex((x) => x.id === id);
  const copy = { ...clone(ev.income[i]!), id: newId(b, 'i') };
  ev.income.splice(i + 1, 0, copy);
  return copy.id;
}

/** The copy gets a free name (חניכים_2); formulas keep using the original. */
export function duplicateParam(b: Budget, evId: string, id: string): string {
  const ev = findEvent(b, evId);
  const i = ev.params.findIndex((x) => x.id === id);
  const src = ev.params[i]!;
  const copy = { ...clone(src), id: newId(b, 'p'), key: uniqueName(src.key, (k) => ev.params.some((p) => p.key === k)) };
  ev.params.splice(i + 1, 0, copy);
  return copy.id;
}

/** A copy of the category ("אש"ל 2") with copies of all its lines. */
export function duplicateCategory(b: Budget, evId: string, catId: string): string {
  const ev = findEvent(b, evId);
  const i = ev.cats.findIndex((c) => c.id === catId);
  const src = ev.cats[i]!;
  if (src.blat) throw new Error('אפשר רק בלת"ם אחד במפעל');
  const name = uniqueName(src.name, (n) => ev.cats.some((c) => c.name === n), ' ');
  const cat: Category = { ...clone(src), id: newId(b, 'c'), name, plan: null, act: null };
  ev.cats.splice(i + 1, 0, cat);
  const lines = ev.lines.filter((l) => l.cat === src.name).map((l) => ({ ...clone(l), id: newId(b, 'l'), cat: name }));
  ev.lines.splice(lineInsertIndex(ev, src.name), 0, ...lines);
  return cat.id;
}

export function duplicatePrice(b: Budget, id: string): string {
  const i = b.prices.findIndex((p) => p.id === id);
  const src = b.prices[i]!;
  const copy = { ...clone(src), id: newId(b, 'r'), key: uniqueName(src.key, (k) => b.prices.some((p) => p.key === k)) };
  b.prices.splice(i + 1, 0, copy);
  return copy.id;
}

export function duplicateSalaryRow(b: Budget, id: string): string {
  const i = b.salary.findIndex((r) => r.id === id);
  const src = b.salary[i]!;
  const copy = { ...clone(src), id: newId(b, 's'), name: uniqueName(src.name, (n) => b.salary.some((r) => r.name === n), ' ') };
  b.salary.splice(i + 1, 0, copy);
  return copy.id;
}

export function deleteLines(b: Budget, evId: string, ids: string[]): void {
  const ev = findEvent(b, evId);
  ev.lines = ev.lines.filter((l) => !ids.includes(l.id));
}
