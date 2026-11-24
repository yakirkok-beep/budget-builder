/**
 * Priority table (CLAUDE.md section 7, "טבלת פריוריטי").
 *
 * For every active event: a row per category (P), a "ללא קטגוריה" row if there
 * are uncategorized lines, and an income row (S) in period 1 if the event has
 * income lines. Spread: period 1..12 = whole amount in that month, "שנתי" =
 * equal split over 12, empty = "ללא תקופה" column.
 */

import type { Budget, EventResult, Period, PriorityRow, PrioritySummary, PriorityTable } from './types';

export const PERIODS = 12;

export function spread(amt: number, period: Period): { m: number[]; none: number } {
  const m = Array<number>(PERIODS).fill(0);
  if (period === 'שנתי') return { m: m.map(() => amt / PERIODS), none: 0 };
  const p = Number(period);
  if (period !== '' && Number.isInteger(p) && p >= 1 && p <= PERIODS) {
    m[p - 1] = amt;
    return { m, none: 0 };
  }
  return { m, none: amt };
}

function summarize(rows: PriorityRow[]): PrioritySummary {
  const m = Array<number>(PERIODS).fill(0);
  let none = 0;
  let total = 0;
  for (const r of rows) {
    r.m.forEach((v, i) => (m[i]! += v));
    none += r.none;
    total += r.amt;
  }
  return { m, none, total };
}

export function buildPriority(budget: Budget, results: Record<string, EventResult>): PriorityTable {
  const rows: PriorityRow[] = [];
  const add = (r: Omit<PriorityRow, 'm' | 'none'>): void => {
    rows.push({ ...r, ...spread(r.amt, r.period) });
  };

  for (const ev of budget.events) {
    if (!ev.active) continue;
    const E = results[ev.id];
    if (!E) continue;
    for (const c of ev.cats) {
      add({ code: c.code, label: ev.name + ' - ' + c.name, type: 'P', amt: E.cats[c.id] ?? 0, period: c.period, ev: ev.id });
    }
    if (E.unassigned) {
      add({ code: '', label: ev.name + ' - ללא קטגוריה', type: 'P', amt: E.unassigned, period: '', ev: ev.id });
    }
    if (ev.income.length) {
      add({ code: ev.incCode || '', label: ev.name + ' - הכנסות', type: 'S', amt: E.inc, period: 1, ev: ev.id });
    }
  }

  return {
    rows,
    expenses: summarize(rows.filter((r) => r.type === 'P')),
    income: summarize(rows.filter((r) => r.type === 'S')),
  };
}

/**
 * Tab-separated text for pasting into Excel (same columns as the prototype's copy button).
 * Amounts keep 2 decimals so the periods add up exactly to the total; no thousands separators.
 */
export function priorityToTsv(table: PriorityTable): string {
  const fmt = (v: number): string => String(Math.round(v * 100) / 100);
  const head = ['קוד', 'מפעל - קטגוריה', 'סוג', 'סכום', 'תקופה', ...Array.from({ length: PERIODS }, (_, i) => 'תקופה ' + (i + 1)), 'ללא תקופה'];
  const line = (cells: (string | number)[]): string =>
    cells.map((c) => (typeof c === 'number' ? fmt(c) : c.replace(/[\t\n\r]/g, ' '))).join('\t');
  const out = [line(head)];
  for (const r of table.rows) out.push(line([r.code, r.label, r.type, r.amt, String(r.period), ...r.m, r.none]));
  out.push(line(['', 'סה"כ הוצאות', 'P', table.expenses.total, '', ...table.expenses.m, table.expenses.none]));
  out.push(line(['', 'סה"כ הכנסות', 'S', table.income.total, '', ...table.income.m, table.income.none]));
  return out.join('\n');
}
