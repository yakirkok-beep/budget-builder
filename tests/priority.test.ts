import { describe, expect, it } from 'vitest';
import { compute } from '../src/domain/compute';
import { priorityToTsv, spread } from '../src/domain/priority';
import { catAmount, ev, loadSeed, near } from './helpers';

const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0);

describe('priority table', () => {
  const b = loadSeed();
  const R = compute(b);
  const T = R.priority;

  it('every row: periods + "ללא תקופה" = row amount', () => {
    for (const r of T.rows) near(sum(r.m) + r.none, r.amt, 1e-6);
  });

  it('table: all periods + "ללא תקופה" = table total', () => {
    const all = T.rows.reduce((s, r) => s + r.amt, 0);
    const spreadTotal = T.rows.reduce((s, r) => s + sum(r.m) + r.none, 0);
    near(spreadTotal, all, 1e-6);
    near(sum(T.expenses.m) + T.expenses.none, T.expenses.total, 1e-6);
    near(sum(T.income.m) + T.income.none, T.income.total, 1e-6);
  });

  it('summary rows match the budget totals', () => {
    near(T.expenses.total, R.tot.exp);
    near(T.income.total, R.tot.inc);
  });

  it('"שנתי" is split into 12 equal parts', () => {
    const fixed = ev(b, 'fixed');
    expect(fixed.cats.every((c) => c.period === 'שנתי')).toBe(true);
    const rows = T.rows.filter((r) => r.ev === 'fixed');
    expect(rows.length).toBe(fixed.cats.length);
    for (const r of rows) {
      expect(r.none).toBe(0);
      for (const x of r.m) near(x, r.amt / 12, 1e-9);
    }
    expect(spread(1200, 'שנתי').m).toEqual(Array(12).fill(100));
  });

  it('a period puts the whole amount in that month; empty goes to "ללא תקופה"', () => {
    expect(spread(500, 8).m[7]).toBe(500);
    expect(sum(spread(500, 8).m)).toBe(500);
    expect(spread(500, '')).toEqual({ m: Array(12).fill(0), none: 500 });
    const wkbRows = T.rows.filter((r) => r.ev === 'wkb' && r.type === 'P');
    expect(wkbRows.every((r) => r.none === r.amt)).toBe(true);
  });

  it('one P row per category, an S row in period 1 per event with income', () => {
    for (const e of b.events.filter((x) => x.active)) {
      const rows = T.rows.filter((r) => r.ev === e.id);
      expect(rows.filter((r) => r.type === 'P')).toHaveLength(e.cats.length);
      const s = rows.filter((r) => r.type === 'S');
      expect(s).toHaveLength(e.income.length ? 1 : 0);
      if (s[0]) {
        expect(s[0].period).toBe(1);
        expect(s[0].code).toBe(e.incCode ?? '');
        near(s[0].m[0], R.ev[e.id]!.inc);
      }
    }
  });

  it('uncategorized lines get their own row with no period', () => {
    const b2 = loadSeed();
    ev(b2, 'semb').lines[0]!.cat = 'לא קיימת';
    const R2 = compute(b2);
    const row = R2.priority.rows.find((r) => r.ev === 'semb' && r.label.endsWith('ללא קטגוריה'))!;
    expect(row).toBeDefined();
    near(row.none, R2.ev['semb']!.unassigned);
    near(R2.priority.expenses.total, R2.tot.exp);
    expect(R2.ev['semb']!.issues.some((i) => i.kind === 'uncategorized')).toBe(true);
    // uncategorized lines still count in expenses and in the contingency base
    near(R2.ev['semb']!.exp, compute(loadSeed()).ev['semb']!.exp, 1);
  });

  it('TSV for Excel', () => {
    const tsv = priorityToTsv(T).split('\n');
    expect(tsv).toHaveLength(T.rows.length + 3);
    for (const line of tsv) expect(line.split('\t')).toHaveLength(18);
    expect(tsv[0]!.split('\t').slice(0, 6)).toEqual(['קוד', 'מפעל - קטגוריה', 'סוג', 'סכום', 'תקופה', 'תקופה 1']);
    expect(tsv.at(-2)).toContain('סה"כ הוצאות');
    // numbers are plain (no thousands separators) and the periods of every row add up to its amount
    for (const line of tsv.slice(1)) {
      const c = line.split('\t');
      const periods = c.slice(5).reduce((s, x) => s + (Number(x) || 0), 0);
      expect(Math.abs(periods - Number(c[3]))).toBeLessThan(0.05);
    }
    const fixed = tsv.find((l) => l.includes('שכר ורכב קבועים - שכר קבוע'))!.split('\t');
    expect(fixed[4]).toBe('שנתי');
    expect(Number(fixed[5])).toBeCloseTo(catAmount('fixed', 'שכר קבוע') / 12, 2);
  });
});
