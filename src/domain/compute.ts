/**
 * Full budget computation (CLAUDE.md section 7). Pure: no React, no browser.
 * Must produce exactly the same numbers as compute() in reference/prototype.html.
 */

import { EMPTY_CONTEXT, FxErr, valueOf, type FormulaContext } from './formula';
import { buildPriority } from './priority';
import type {
  Budget,
  BudgetEvent,
  BudgetResult,
  EventResult,
  FieldResult,
  IncomeResult,
  Issue,
  IssueKind,
  LineResult,
  Totals,
} from './types';

export const SALARY_LEVEL_KEY = 'רמת_שכר';
export const INFLATION_KEY = 'התייקרות';
export const BLAT_KEY = 'בלתם';
export const EVENT_BLAT_KEY = 'אחוז_בלתם';

const errMsg = (e: unknown): string => (e instanceof FxErr ? e.message : 'שגיאה לא צפויה');

function field(raw: unknown, ctx: FormulaContext): FieldResult {
  try {
    return { v: valueOf(raw, ctx) };
  } catch (e) {
    return { err: errMsg(e) };
  }
}

/** Evaluate globals (except רמת_שכר). Formulas there can't reference names. */
function evalGlobals(budget: Budget): { values: Map<string, number>; errors: Record<string, string> } {
  const values = new Map<string, number>();
  const errors: Record<string, string> = {};
  for (const [k, raw] of Object.entries(budget.globals)) {
    if (k === SALARY_LEVEL_KEY) continue;
    try {
      values.set(k, valueOf(raw, EMPTY_CONTEXT) ?? 0);
    } catch (e) {
      values.set(k, 0);
      errors[k] = errMsg(e);
    }
  }
  return { values, errors };
}

function evalPrices(budget: Budget): { values: Map<string, number>; errors: Record<string, string> } {
  const values = new Map<string, number>();
  const errors: Record<string, string> = {};
  for (const p of budget.prices) {
    try {
      values.set(p.key, valueOf(p.value, EMPTY_CONTEXT) ?? 0);
    } catch (e) {
      values.set(p.key, 0);
      errors[p.id] = errMsg(e);
    }
  }
  return { values, errors };
}

function makeSalaryLookup(budget: Budget): (name: string) => number {
  const level = String(budget.globals[SALARY_LEVEL_KEY] ?? '');
  return (name) => {
    const row = budget.salary.find((r) => r.name === name);
    if (!row) throw new FxErr('אין בטבלת השכר: ' + name);
    const raw = (row.levels as Record<string, unknown>)[level];
    if (raw == null || raw === '') throw new FxErr('אין שכר לרמה ' + level + ' ב' + name);
    if (typeof raw === 'number') return raw;
    try {
      return valueOf(raw, EMPTY_CONTEXT) ?? 0;
    } catch (e) {
      throw new FxErr('שכר לא תקין ב' + name + ' (' + level + '): ' + errMsg(e));
    }
  };
}

/** Evaluate a value that can't reference names (globals, prices, salary table). */
export function constField(raw: unknown): FieldResult {
  return field(raw, EMPTY_CONTEXT);
}

/** Minimum wage for a salary row: hours × שכר_מינימום (CLAUDE.md section 8.5). */
export function minimumWage(hours: unknown, globals: Record<string, number>): number | null {
  const h = constField(hours);
  return h.v == null ? null : h.v * (globals['שכר_מינימום'] ?? 0);
}

/** Build short issue messages: one per kind per event. */
function quoteList(names: string[], max = 3): string {
  const q = names.map((n) => '"' + (n || 'ללא שם') + '"');
  return q.length > max ? q.slice(0, max).join(', ') + ' ועוד ' + (q.length - max) : q.join(', ');
}

function computeEvent(
  ev: BudgetEvent,
  G: Map<string, number>,
  prices: Map<string, number>,
  sal: (name: string) => number,
  infl: number,
): EventResult {
  // Params can reference each other in any order: lazy evaluation with memo and cycle detection.
  const paramByKey = new Map<string, BudgetEvent['params'][number]>();
  for (const p of ev.params) if (!paramByKey.has(p.key)) paramByKey.set(p.key, p);
  const memo = new Map<string, { v: number } | { err: string }>();
  const busy = new Set<string>();

  const evalParam = (key: string): number => {
    const hit = memo.get(key);
    if (hit) {
      if ('err' in hit) throw new FxErr(hit.err);
      return hit.v;
    }
    if (busy.has(key)) throw new FxErr('הפניה מעגלית: ' + key);
    busy.add(key);
    try {
      const v = valueOf(paramByKey.get(key)!.value, ctx) ?? 0;
      memo.set(key, { v });
      return v;
    } catch (e) {
      memo.set(key, { err: errMsg(e) });
      throw e;
    } finally {
      busy.delete(key);
    }
  };

  const ctx: FormulaContext = {
    lookup: (name) => {
      if (paramByKey.has(name)) return evalParam(name);
      const g = G.get(name);
      if (g !== undefined) return g;
      const pr = prices.get(name);
      if (pr !== undefined) return pr;
      throw new FxErr('שם לא מוכר: ' + name);
    },
    sal,
  };

  const params: Record<string, FieldResult> = {};
  const badParams: string[] = [];
  let firstParamErr = '';
  for (const p of ev.params) {
    try {
      params[p.id] = { v: evalParam(p.key) };
    } catch (e) {
      params[p.id] = { err: errMsg(e) };
      badParams.push(p.key);
      firstParamErr ||= errMsg(e);
    }
  }

  // Lines
  const catNames = new Set(ev.cats.filter((c) => !c.blat).map((c) => c.name));
  const catSum = new Map<string, number>();
  const lines: Record<string, LineResult> = {};
  const badLines: string[] = [];
  let firstLineErr = '';
  const orphanLines: string[] = [];
  let unassigned = 0;

  for (const l of ev.lines) {
    const q = field(l.qty, ctx);
    const d = field(l.days, ctx);
    const p = field(l.price, ctx);
    const err = q.err ?? d.err ?? p.err ?? null;
    let t = 0;
    if (!err && q.v != null && p.v != null) t = q.v * (d.v == null ? 1 : d.v) * p.v * infl;
    lines[l.id] = { q, d, p, t, err };
    if (err) {
      badLines.push(l.item);
      firstLineErr ||= err;
    }
    if (catNames.has(l.cat)) catSum.set(l.cat, (catSum.get(l.cat) ?? 0) + t);
    else {
      unassigned += t;
      if (t) orphanLines.push(l.item);
    }
  }

  // Categories
  const cats: Record<string, number> = {};
  let nonBlat = 0;
  for (const c of ev.cats) {
    if (c.blat) continue;
    const a = catSum.get(c.name) ?? 0;
    cats[c.id] = a;
    nonBlat += a;
  }
  let pct: number;
  try {
    pct = paramByKey.has(EVENT_BLAT_KEY) ? evalParam(EVENT_BLAT_KEY) : (G.get(BLAT_KEY) ?? 0);
  } catch {
    pct = 0;
  }
  for (const c of ev.cats) {
    if (c.blat) cats[c.id] = Math.round((pct || 0) * (nonBlat + unassigned));
  }
  let exp = unassigned;
  for (const c of ev.cats) exp += cats[c.id] ?? 0;

  // Income (no inflation)
  const income: Record<string, IncomeResult> = {};
  const badIncome: string[] = [];
  let firstIncomeErr = '';
  let inc = 0;
  for (const i of ev.income) {
    const q = field(i.qty, ctx);
    const p = field(i.price, ctx);
    const err = q.err ?? p.err ?? null;
    const t = !err && q.v != null && p.v != null ? q.v * p.v : 0;
    income[i.id] = { q, p, t, err };
    if (err) {
      badIncome.push(i.label);
      firstIncomeErr ||= err;
    }
    inc += t;
  }

  let part: number | null = null;
  if (ev.partKey && paramByKey.has(ev.partKey)) {
    try {
      part = evalParam(ev.partKey);
    } catch {
      part = null;
    }
  }

  const def = exp - inc;
  const plan26 = ev.cats.reduce((s, c) => s + (Number(c.plan) || 0), 0);
  const act26 = ev.cats.reduce((s, c) => s + (Number(c.act) || 0), 0);

  // Issues: one short message per kind
  const issues: Issue[] = [];
  const push = (kind: IssueKind, msg: string): void => {
    issues.push({ ev: ev.id, name: ev.name, kind, msg });
  };
  if (badParams.length) {
    push(
      'param-error',
      badParams.length === 1
        ? 'שגיאה בפרמטר ' + badParams[0] + ': ' + firstParamErr
        : 'שגיאה ב-' + badParams.length + ' פרמטרים: ' + badParams.slice(0, 4).join(', ') + (badParams.length > 4 ? '...' : ''),
    );
  }
  if (badLines.length) {
    push(
      'line-error',
      badLines.length === 1
        ? 'שגיאה בשורה ' + quoteList(badLines) + ': ' + firstLineErr
        : 'שגיאה ב-' + badLines.length + ' שורות: ' + quoteList(badLines),
    );
  }
  if (badIncome.length) {
    push(
      'income-error',
      badIncome.length === 1
        ? 'שגיאה בהכנסה ' + quoteList(badIncome) + ': ' + firstIncomeErr
        : 'שגיאה ב-' + badIncome.length + ' שורות הכנסה: ' + quoteList(badIncome),
    );
  }
  if (orphanLines.length) {
    push(
      'uncategorized',
      orphanLines.length === 1
        ? 'שורה בלי קטגוריה תקינה: ' + quoteList(orphanLines)
        : orphanLines.length + ' שורות בלי קטגוריה תקינה: ' + quoteList(orphanLines),
    );
  }
  const noCode = ev.cats.filter((c) => !c.code).map((c) => c.name);
  if (noCode.length) {
    push('no-code', noCode.length === ev.cats.length ? 'אין קודי פריוריטי (לפתוח קודים)' : 'אין קוד פריוריטי: ' + noCode.join(', '));
  }
  const noPeriod = ev.cats.filter((c) => c.period === '' || c.period == null).map((c) => c.name);
  if (noPeriod.length) {
    push('no-period', noPeriod.length === ev.cats.length ? 'לא נקבעה תקופה (חודש)' : 'אין תקופה: ' + noPeriod.join(', '));
  }
  if (ev.income.length && !ev.incCode) push('no-income-code', 'אין קוד הכנסה');

  return {
    params,
    lines,
    income,
    cats,
    issues,
    exp,
    inc,
    def,
    part,
    perHead: part ? exp / part : null,
    subsidyPerHead: part ? def / part : null,
    unassigned,
    pct,
    plan26,
    act26,
    incPlan26: Number(ev.incPlan) || 0,
    incAct26: Number(ev.incAct) || 0,
  };
}

export function compute(budget: Budget): BudgetResult {
  const { values: G, errors: globalErrors } = evalGlobals(budget);
  const { values: prices, errors: priceErrors } = evalPrices(budget);
  const infl = 1 + (G.get(INFLATION_KEY) || 0);
  const sal = makeSalaryLookup(budget);

  const ev: Record<string, EventResult> = {};
  const tot: Totals = { exp: 0, inc: 0, def: 0, plan26: 0, act26: 0, incPlan26: 0, incAct26: 0 };
  const issues: Issue[] = [];

  for (const e of budget.events) {
    const E = computeEvent(e, G, prices, sal, infl);
    ev[e.id] = E;
    if (!e.active) continue;
    tot.exp += E.exp;
    tot.inc += E.inc;
    tot.plan26 += E.plan26;
    tot.act26 += E.act26;
    tot.incPlan26 += E.incPlan26;
    tot.incAct26 += E.incAct26;
    issues.push(...E.issues);
  }
  tot.def = tot.exp - tot.inc;

  return {
    ev,
    tot,
    issues,
    priority: buildPriority(budget, ev),
    globals: Object.fromEntries(G),
    globalErrors,
    prices: Object.fromEntries(prices),
    priceErrors,
  };
}
