/**
 * Upgrade and validate a loaded JSON file (CLAUDE.md section 10).
 * Accepts anything; returns a well-formed Budget of the current schema or throws MigrateError.
 * Missing optional fields get safe defaults, so older or hand-edited files still load.
 */

import { CURRENT_SCHEMA, LEVELS, type Budget, type BudgetEvent, type Category, type Period, type Val } from './types';

export class MigrateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrateError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));
const val = (v: unknown): Val => (typeof v === 'number' || typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function period(v: unknown): Period {
  if (v === 'שנתי') return 'שנתי';
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12) return n;
  return '';
}

function category(c: Obj): Category {
  return {
    id: str(c.id),
    name: str(c.name),
    code: str(c.code),
    period: period(c.period),
    blat: c.blat === true,
    plan: numOrNull(c.plan),
    act: numOrNull(c.act),
  };
}

function event(e: Obj): BudgetEvent {
  const ev: BudgetEvent = {
    id: str(e.id),
    name: str(e.name, 'מפעל'),
    active: e.active !== false,
    sub: str(e.sub),
    params: arr(e.params).filter(isObj).map((p) => ({ id: str(p.id), key: str(p.key), value: val(p.value), note: str(p.note) })),
    income: arr(e.income)
      .filter(isObj)
      .map((i) => ({ id: str(i.id), label: str(i.label), qty: val(i.qty), price: val(i.price), note: str(i.note) })),
    lines: arr(e.lines)
      .filter(isObj)
      .map((l) => ({
        id: str(l.id),
        cat: str(l.cat),
        item: str(l.item),
        qty: val(l.qty),
        days: val(l.days),
        price: val(l.price),
        note: str(l.note),
      })),
    cats: arr(e.cats).filter(isObj).map(category),
    partKey: strOrNull(e.partKey),
    incCode: strOrNull(e.incCode),
    notes: arr(e.notes).map((n) => str(n)),
  };
  if ('incPlan' in e) ev.incPlan = numOrNull(e.incPlan);
  if ('incAct' in e) ev.incAct = numOrNull(e.incAct);
  return ev;
}

/** Highest numeric suffix of any id in the budget, so new ids never collide. */
function maxIdNumber(b: Budget): number {
  let max = 0;
  const see = (id: string): void => {
    const m = /(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  };
  b.prices.forEach((p) => see(p.id));
  b.salary.forEach((s) => see(s.id));
  for (const ev of b.events) {
    see(ev.id);
    for (const k of ['params', 'income', 'lines', 'cats'] as const) ev[k].forEach((x) => see(x.id));
  }
  return max;
}

/** Give missing or duplicate ids a fresh one. */
function fixIds(b: Budget): void {
  const seen = new Set<string>();
  const fix = (x: { id: string }, prefix: string): void => {
    if (!x.id || seen.has(x.id)) {
      b.nextId += 1;
      x.id = prefix + b.nextId;
    }
    seen.add(x.id);
  };
  b.prices.forEach((p) => fix(p, 'r'));
  b.salary.forEach((s) => fix(s, 's'));
  for (const ev of b.events) {
    fix(ev, 'e');
    ev.params.forEach((x) => fix(x, 'p'));
    ev.income.forEach((x) => fix(x, 'i'));
    ev.lines.forEach((x) => fix(x, 'l'));
    ev.cats.forEach((x) => fix(x, 'c'));
  }
}

export function migrate(raw: unknown): Budget {
  if (!isObj(raw) || !Array.isArray(raw.events) || !isObj(raw.globals)) {
    throw new MigrateError('הקובץ לא נראה כמו גיבוי של הכלי');
  }
  const schema = raw.schema == null ? 1 : Number(raw.schema);
  if (!Number.isFinite(schema) || schema > CURRENT_SCHEMA) {
    throw new MigrateError('הקובץ נוצר בגרסה חדשה יותר של הכלי');
  }
  // schema 1 is the first and current version. Future upgrades go here: if (schema < 2) {...}

  const globals: Record<string, Val> = {};
  for (const [k, v] of Object.entries(raw.globals)) globals[k] = val(v);

  const globalNotes: Record<string, string> = {};
  if (isObj(raw.globalNotes)) for (const [k, v] of Object.entries(raw.globalNotes)) globalNotes[k] = str(v);

  const b: Budget = {
    schema: CURRENT_SCHEMA,
    name: str(raw.name, 'תקציב'),
    year: typeof raw.year === 'number' ? raw.year : Number(raw.year) || new Date().getFullYear() + 1,
    globals,
    globalNotes,
    prices: arr(raw.prices)
      .filter(isObj)
      .map((p) => ({ id: str(p.id), key: str(p.key), label: str(p.label), value: val(p.value), unit: str(p.unit) })),
    salary: arr(raw.salary)
      .filter(isObj)
      .map((s) => {
        const lv = isObj(s.levels) ? s.levels : {};
        return {
          id: str(s.id),
          name: str(s.name),
          hours: val(s.hours),
          levels: Object.fromEntries(LEVELS.map((l) => [l, val(lv[l])])) as Budget['salary'][number]['levels'],
          note: str(s.note),
        };
      }),
    events: raw.events.filter(isObj).map(event),
    nextId: 0,
  };
  b.nextId = Math.max(typeof raw.nextId === 'number' ? raw.nextId : 0, maxIdNumber(b));
  fixIds(b);
  return b;
}
