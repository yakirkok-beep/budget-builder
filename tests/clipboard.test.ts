import { describe, expect, it } from 'vitest';
import { compute } from '../src/domain/compute';
import * as C from '../src/domain/clipboard';
import { blankEvent, reid } from '../src/domain/templates';
import type { Clip } from '../src/domain/clipboard';
import type { Budget } from '../src/domain/types';
import { ev, loadSeed, near } from './helpers';

type Of<K extends Clip['kind']> = Extract<Clip, { kind: K }>;

const lineByItem = (b: Budget, evId: string, item: string) => ev(b, evId).lines.find((l) => l.item === item)!;
const allIds = (b: Budget): string[] => [
  ...b.prices.map((p) => p.id),
  ...b.salary.map((s) => s.id),
  ...b.events.flatMap((e) => [e.id, ...e.params.map((x) => x.id), ...e.income.map((x) => x.id), ...e.lines.map((x) => x.id), ...e.cats.map((x) => x.id)]),
];
const unique = (b: Budget): void => {
  const ids = allIds(b);
  expect(new Set(ids).size).toBe(ids.length);
};
/** An empty event appended to the budget (no params, no categories). */
function emptyEvent(b: Budget): string {
  const e = reid(b, blankEvent('ריק'));
  e.params = [];
  e.lines = [];
  e.income = [];
  e.cats = [];
  b.events.push(e);
  return e.id;
}

describe('copy collects what formulas need', () => {
  it('params, transitively, and prices', () => {
    const b = loadSeed();
    const bus = ev(b, 'semb').lines.find((l) => l.qty === '=אוטובוסים')!; // אוטובוסים = למעלה(חניכים/נוסעים_באוטובוס)
    const clip = C.copyLines(b, 'semb', [bus.id]) as Of<'lines'>;
    expect(clip.deps.params.map((p) => p.key).sort()).toEqual(['אוטובוסים', 'חניכים', 'נוסעים_באוטובוס'].sort());
    expect(clip.deps.prices.map((p) => p.key)).toEqual(expect.arrayContaining([String(bus.price).slice(1)]));
  });

  it('salary rows through שכר("...")', () => {
    const b = loadSeed();
    const params = C.copyParams(b, 'semb', [ev(b, 'semb').params.find((p) => p.key === 'שכר_מנחה')!.id]) as Of<'params'>;
    const cat = C.copyCategory(b, 'semb', ev(b, 'semb').cats.find((c) => c.name === 'שכר')!.id) as Of<'category'>;
    expect(cat.deps.salary.map((r) => r.name)).toContain('סמינריון');
    expect(params.deps.salary.map((r) => r.name)).toContain('סמינריון');
  });

  it('describes the clip in Hebrew', () => {
    const b = loadSeed();
    const ids = ev(b, 'semb').lines.slice(0, 3).map((l) => l.id);
    expect(C.describeClip(C.copyLines(b, 'semb', ids))).toBe('3 שורות הוצאה מסמינריון בנים');
  });
});

describe('paste lines into another event', () => {
  it('adds the missing params, prices and categories, and the lines keep their totals', () => {
    const b = loadSeed();
    const src = ev(b, 'semb').lines.filter((l) => l.cat === 'תחבורה');
    const before = compute(b).ev['semb']!;
    const clip = C.copyLines(b, 'semb', src.map((l) => l.id)) as Of<'lines'>;
    b.prices = b.prices.filter((p) => !clip.deps.prices.some((d) => d.key === p.key)); // as if pasting into a budget without them
    b.prices.push(...clip.deps.prices); // (restore so the source keeps working)
    const target = emptyEvent(b);
    const res = C.pasteLines(b, target, clip);
    expect(res.ids).toHaveLength(src.length);
    expect(res.notes.join(' ')).toMatch(/נוספו פרמטרים/);
    expect(res.notes.join(' ')).toMatch(/נוספה קטגוריה: תחבורה/);
    const t = ev(b, target);
    expect(t.cats.find((c) => c.name === 'תחבורה')!.code).toBe(ev(b, 'semb').cats.find((c) => c.name === 'תחבורה')!.code);
    const R = compute(b);
    near(R.ev[target]!.cats[t.cats[0]!.id], before.cats[ev(b, 'semb').cats.find((c) => c.name === 'תחבורה')!.id]!);
    expect(R.ev[target]!.issues.filter((i) => i.kind.endsWith('error'))).toEqual([]);
    unique(b);
  });

  it('into a chosen category, before a chosen line', () => {
    const b = loadSeed();
    const line = lineByItem(b, 'semb', ev(b, 'semb').lines[0]!.item);
    const clip = C.copyLines(b, 'semb', [line.id]) as Of<'lines'>;
    const w = ev(b, 'wkb');
    const anchor = w.lines.find((l) => l.cat === 'תחבורה')!;
    const res = C.pasteLines(b, 'wkb', clip, { cat: 'תחבורה', beforeId: anchor.id });
    const i = w.lines.findIndex((l) => l.id === res.ids[0]);
    expect(w.lines[i]!.cat).toBe('תחבורה');
    expect(w.lines[i + 1]!.id).toBe(anchor.id);
  });

  it('keeps the target event values for params it already has, and says so', () => {
    const b = loadSeed();
    const line = ev(b, 'semb').lines.find((l) => l.qty === '=חניכים')!;
    const res = C.pasteLines(b, 'semg', C.copyLines(b, 'semb', [line.id]) as Of<'lines'>);
    expect(res.notes.join(' ')).toMatch(/בשימוש הערכים של המפעל הזה: חניכים/);
    const pasted = ev(b, 'semg').lines.find((l) => l.id === res.ids[0])!;
    expect(compute(b).ev['semg']!.lines[pasted.id]!.q.v).toBe(400); // semg's own חניכים
  });

  it('works across budgets: prices and salary rows come along', () => {
    const a = loadSeed();
    const other = loadSeed();
    other.prices = [];
    other.salary = [];
    const wageLine = ev(a, 'semb').lines.find((l) => String(l.price).includes('שכר_מנחה') || String(l.qty).includes('שכר_מנחה')) ?? ev(a, 'semb').lines.find((l) => l.cat === 'שכר')!;
    const clip = C.copyLines(a, 'semb', [wageLine.id]) as Of<'lines'>;
    const target = emptyEvent(other);
    const res = C.pasteLines(other, target, clip);
    expect(res.notes.join(' ')).toMatch(/נוספו לטבלת השכר|נוספו למחירון/);
    expect(compute(other).ev[target]!.issues.filter((i) => i.kind.endsWith('error'))).toEqual([]);
    near(compute(other).ev[target]!.lines[res.ids[0]!]!.t, compute(a).ev['semb']!.lines[wageLine.id]!.t);
  });
});

describe('paste a whole category', () => {
  it('merges into a category with the same name', () => {
    const b = loadSeed();
    const cat = ev(b, 'semb').cats.find((c) => c.name === 'ציוד')!;
    const n = ev(b, 'semb').lines.filter((l) => l.cat === 'ציוד').length;
    const before = ev(b, 'wkb').lines.filter((l) => l.cat === 'ציוד').length;
    const res = C.pasteCategory(b, 'wkb', C.copyCategory(b, 'semb', cat.id) as Of<'category'>);
    expect(res.notes.join(' ')).toMatch(/לקטגוריה הקיימת/);
    expect(ev(b, 'wkb').lines.filter((l) => l.cat === 'ציוד')).toHaveLength(before + n);
    expect(ev(b, 'wkb').cats.filter((c) => c.name === 'ציוד')).toHaveLength(1);
  });

  it('creates it (with code and period, without 2026 numbers) where it is missing', () => {
    const b = loadSeed();
    const cat = ev(b, 'semb').cats.find((c) => c.name === 'אש"ל')!;
    C.pasteCategory(b, 'dev', C.copyCategory(b, 'semb', cat.id) as Of<'category'>);
    const made = ev(b, 'dev').cats.find((c) => c.name === 'אש"ל')!;
    expect(made.code).toBe(cat.code);
    expect(made.period).toBe(cat.period);
    expect(made.plan).toBeNull();
    expect(compute(b).ev['dev']!.issues.filter((i) => i.kind.endsWith('error'))).toEqual([]);
  });

  it('a second blat category is refused', () => {
    const b = loadSeed();
    const blat = ev(b, 'semb').cats.find((c) => c.blat)!;
    const res = C.pasteCategory(b, 'semg', C.copyCategory(b, 'semb', blat.id) as Of<'category'>);
    expect(res.ids).toEqual([]);
    expect(ev(b, 'semg').cats.filter((c) => c.blat)).toHaveLength(1);
  });
});

describe('paste params, prices, salary: existing names', () => {
  it('reports conflicts; skip keeps, overwrite replaces', () => {
    const b = loadSeed();
    const p = ev(b, 'semb').params.filter((x) => x.key === 'חניכים' || x.key === 'לילות');
    const clip = C.copyParams(b, 'semb', p.map((x) => x.id)) as Of<'params'>;
    expect(C.pasteConflicts(b, clip, 'semg').sort()).toEqual(['חניכים', 'לילות'].sort());
    C.pasteParams(b, 'semg', clip, 'skip');
    expect(ev(b, 'semg').params.find((x) => x.key === 'חניכים')!.value).toBe(400);
    C.pasteParams(b, 'semg', clip, 'overwrite');
    expect(ev(b, 'semg').params.find((x) => x.key === 'חניכים')!.value).toBe(350);
    expect(ev(b, 'semg').params.filter((x) => x.key === 'חניכים')).toHaveLength(1);
  });

  it('prices and salary rows between budgets', () => {
    const a = loadSeed();
    const other = loadSeed();
    other.prices = other.prices.slice(0, 2);
    const clip = C.copyPrices(a, a.prices.slice(0, 4).map((p) => p.id)) as Of<'prices'>;
    expect(C.pasteConflicts(other, clip)).toHaveLength(2);
    C.pastePrices(other, clip, 'skip');
    expect(other.prices).toHaveLength(4);
    const sal = C.copySalary(a, [a.salary[0]!.id]) as Of<'salary'>;
    other.salary[0]!.levels['מתחיל'] = 1;
    C.pasteSalary(other, sal, 'overwrite');
    expect(other.salary[0]!.levels['מתחיל']).toBe(a.salary[0]!.levels['מתחיל']);
    unique(other);
  });
});

describe('events between budgets', () => {
  it('pasting an event brings its prices and salary rows; same totals', () => {
    const a = loadSeed();
    const other = loadSeed();
    other.events = [];
    other.prices = [];
    other.salary = [];
    const res = C.pasteEvent(other, C.copyEvent(a, 'semb') as Of<'event'>);
    const R = compute(other);
    near(R.ev[res.ids[0]!]!.exp, compute(a).ev['semb']!.exp);
    expect(res.notes.join(' ')).toMatch(/נוספו למחירון/);
    unique(other);
  });

  it('a name that already exists gets "(עותק)"', () => {
    const b = loadSeed();
    const res = C.pasteEvent(b, C.copyEvent(b, 'masa') as Of<'event'>);
    expect(ev(b, res.ids[0]!).name).toBe('מסע גרעין (עותק)');
  });
});

describe('move', () => {
  it('moveItem: before another item, or to the end', () => {
    const xs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    C.moveItem(xs, 'c', 'a');
    expect(xs.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    C.moveItem(xs, 'c', null);
    expect(xs.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('lines to another category inside the event: totals stay', () => {
    const b = loadSeed();
    const before = compute(b).ev['semb']!.exp;
    const e = ev(b, 'semb');
    const ids = e.lines.filter((l) => l.cat === 'ציוד').map((l) => l.id);
    C.moveLines(b, 'semb', ids, { cat: 'הכנה' });
    expect(e.lines.filter((l) => l.cat === 'ציוד')).toHaveLength(0);
    const prep = e.lines.filter((l) => l.cat === 'הכנה').map((l) => l.id);
    expect(prep.slice(-ids.length)).toEqual(ids);
    near(compute(b).ev['semb']!.exp, before);
  });

  it('reorder: before a line', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    const [first, second] = e.lines;
    C.moveLines(b, 'semb', [second!.id], { beforeId: first!.id });
    expect(e.lines[0]!.id).toBe(second!.id);
  });

  it('lines to another event: gone here, there with their params', () => {
    const b = loadSeed();
    const ids = ev(b, 'semb').lines.filter((l) => l.cat === 'אבטחה').map((l) => l.id);
    const res = C.transferLines(b, 'semb', ids, 'dev');
    expect(ev(b, 'semb').lines.some((l) => ids.includes(l.id))).toBe(false);
    expect(ev(b, 'dev').lines.filter((l) => res.ids.includes(l.id))).toHaveLength(ids.length);
    expect(compute(b).ev['dev']!.issues.filter((i) => i.kind.endsWith('error'))).toEqual([]);
  });

  it('a whole category to another event', () => {
    const b = loadSeed();
    const cat = ev(b, 'semb').cats.find((c) => c.name === 'הדרכה')!;
    const amount = compute(b).ev['semb']!.cats[cat.id]!;
    C.transferCategory(b, 'semb', cat.id, 'irgun');
    expect(ev(b, 'semb').cats.some((c) => c.name === 'הדרכה')).toBe(false);
    const there = ev(b, 'irgun').cats.find((c) => c.name === 'הדרכה')!;
    near(compute(b).ev['irgun']!.cats[there.id]!, amount);
  });

  it('events, params, prices and salary rows reorder', () => {
    const b = loadSeed();
    C.moveEventTo(b, 'fixed', 'coord');
    expect(b.events[0]!.id).toBe('fixed');
    const e = ev(b, 'semb');
    const last = e.params.at(-1)!.id;
    C.moveParam(b, 'semb', last, e.params[0]!.id);
    expect(e.params[0]!.id).toBe(last);
    C.movePrice(b, b.prices[0]!.id, null);
    C.moveSalaryRow(b, b.salary[0]!.id, null);
    unique(b);
  });
});

describe('duplicate in place', () => {
  it('lines: right after the source, totals grow by the line', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    const line = e.lines[2]!;
    const t = compute(b).ev['semb']!.lines[line.id]!.t;
    const before = compute(b).ev['semb']!.exp;
    const [id] = C.duplicateLines(b, 'semb', [line.id]);
    expect(e.lines[3]!.id).toBe(id);
    const R = compute(b).ev['semb']!;
    // the line itself, plus the contingency on it (rounded to whole shekels)
    near(R.exp - before, t * (1 + R.pct), 1);
  });

  it('a param gets a free name, a category a numbered name with copies of its lines', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    const pid = C.duplicateParam(b, 'semb', e.params.find((p) => p.key === 'חניכים')!.id);
    expect(e.params.find((p) => p.id === pid)!.key).toBe('חניכים_2');
    const cat = e.cats.find((c) => c.name === 'ציוד')!;
    const n = e.lines.filter((l) => l.cat === 'ציוד').length;
    const cid = C.duplicateCategory(b, 'semb', cat.id);
    const copy = e.cats.find((c) => c.id === cid)!;
    expect(copy.name).toBe('ציוד 2');
    expect(e.lines.filter((l) => l.cat === 'ציוד 2')).toHaveLength(n);
    near(compute(b).ev['semb']!.cats[cid]!, compute(b).ev['semb']!.cats[cat.id]!);
    unique(b);
  });

  it('income, prices, salary rows', () => {
    const b = loadSeed();
    const iid = C.duplicateIncome(b, 'semb', ev(b, 'semb').income[0]!.id);
    expect(ev(b, 'semb').income[1]!.id).toBe(iid);
    const pid = C.duplicatePrice(b, b.prices[0]!.id);
    expect(b.prices[1]!.key).toBe(b.prices[0]!.key + '_2');
    expect(b.prices[1]!.id).toBe(pid);
    C.duplicateSalaryRow(b, b.salary[0]!.id);
    expect(b.salary[1]!.name).toBe(b.salary[0]!.name + ' 2');
    unique(b);
  });
});
