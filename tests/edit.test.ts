import { describe, expect, it } from 'vitest';
import { compute } from '../src/domain/compute';
import * as E from '../src/domain/edit';
import { catAmount, ev, evExp, loadSeed, near, TOTAL_EXP } from './helpers';

describe('edit operations', () => {
  it('values typed as text are stored as numbers, formulas as is', () => {
    const b = loadSeed();
    const p = ev(b, 'semb').params[0]!;
    E.setParamField(b, 'semb', p.id, 'value', '1,200');
    expect(p.value).toBe(1200);
    E.setParamField(b, 'semb', p.id, 'value', ' =מנחים*2 ');
    expect(p.value).toBe('=מנחים*2');
    E.setParamField(b, 'semb', p.id, 'value', '');
    expect(p.value).toBe('');
    E.setGlobal(b, 'התייקרות', '3%');
    expect(b.globals['התייקרות']).toBe('3%');
    near(compute(b).globals['התייקרות']!, 0.03, 1e-12);
    E.setGlobal(b, 'רמת_שכר', 'בכיר');
    expect(b.globals['רמת_שכר']).toBe('בכיר');
  });

  it('a new line goes after the last line of its category, with default qty and days', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    const id = E.addLine(b, 'semb', 'תחבורה');
    const idx = e.lines.findIndex((l) => l.id === id);
    expect(e.lines[idx - 1]!.cat).toBe('תחבורה');
    expect(e.lines[idx + 1]?.cat).not.toBe('תחבורה');
    expect(e.lines[idx]).toMatchObject({ cat: 'תחבורה', qty: 1, days: 1, price: '' });
    // empty price: total 0, numbers unchanged
    near(compute(b).ev['semb']!.exp, evExp('semb'));
    const id2 = E.addLine(b, 'semb');
    expect(e.lines.find((l) => l.id === id2)!.cat).toBe(e.cats[0]!.name);
  });

  it('new names are unique', () => {
    const b = loadSeed();
    const a = E.addParam(b, 'semb');
    const c = E.addParam(b, 'semb');
    const keys = ev(b, 'semb').params.filter((p) => p.id === a || p.id === c).map((p) => p.key);
    expect(keys).toEqual(['פרמטר_חדש', 'פרמטר_חדש_2']);
    const k1 = E.addCategory(b, 'semb');
    const k2 = E.addCategory(b, 'semb');
    expect(ev(b, 'semb').cats.filter((x) => x.id === k1 || x.id === k2).map((x) => x.name)).toEqual(['קטגוריה חדשה', 'קטגוריה חדשה 2']);
    const s1 = E.addSalaryRow(b);
    const s2 = E.addSalaryRow(b);
    expect(b.salary.filter((r) => r.id === s1 || r.id === s2).map((r) => r.name)).toEqual(['אירוע חדש', 'אירוע חדש 2']);
    const p1 = E.addPrice(b);
    const p2 = E.addPrice(b);
    expect(b.prices.filter((p) => p.id === p1 || p.id === p2).map((p) => p.key)).toEqual(['מחיר_חדש', 'מחיר_חדש_2']);
  });

  it('a new category goes before the blat category and takes the first period', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    const id = E.addCategory(b, 'semb');
    const i = e.cats.findIndex((c) => c.id === id);
    expect(e.cats[i + 1]!.blat).toBe(true);
    expect(e.cats[i]!.period).toBe(e.cats[0]!.period);
  });

  it('adding a blat category adds אחוז_בלתם when missing', () => {
    // coord has the param but no blat category: the param is not added twice
    const b = loadSeed();
    const coord = ev(b, 'coord');
    const R0 = compute(b).ev['coord']!;
    E.addBlatCategory(b, 'coord');
    expect(coord.params.filter((p) => p.key === 'אחוז_בלתם')).toHaveLength(1);
    near(compute(b).ev['coord']!.exp, R0.exp + Math.round(R0.pct * R0.exp));

    // without the param: it is added as =בלתם (7%)
    const b2 = loadSeed();
    const dev = ev(b2, 'dev');
    E.deleteParam(b2, 'dev', dev.params.find((p) => p.key === 'אחוז_בלתם')!.id);
    const before = compute(b2).ev['dev']!.exp;
    E.addBlatCategory(b2, 'dev');
    expect(dev.params.find((p) => p.key === 'אחוז_בלתם')!.value).toBe('=בלתם');
    near(compute(b2).ev['dev']!.exp, before + Math.round(before * 0.07));
  });

  it('deleting a category leaves its lines as uncategorized; totals stay', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    const cat = e.cats.find((c) => c.name === 'ציוד')!;
    const n = E.linesInCategory(b, 'semb', cat.id);
    expect(n).toBeGreaterThan(0);
    E.deleteCategory(b, 'semb', cat.id);
    expect(e.lines.filter((l) => l.cat === 'ציוד')).toHaveLength(n);
    const R = compute(b).ev['semb']!;
    near(R.unassigned, catAmount('semb', 'ציוד'));
    near(R.exp, evExp('semb'));
    expect(R.issues.some((i) => i.kind === 'uncategorized')).toBe(true);
  });

  it('deleting the participants param clears partKey', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    E.deleteParam(b, 'semb', e.params.find((p) => p.key === 'חניכים')!.id);
    expect(e.partKey).toBeNull();
    const R = compute(b).ev['semb']!;
    expect(R.part).toBeNull();
    expect(R.issues.some((i) => i.kind === 'line-error')).toBe(true);
  });

  it('duplicating an event puts the copy right after it, with new ids and the same numbers', () => {
    const b = loadSeed();
    const id = E.duplicateEvent(b, 'semg');
    const i = b.events.findIndex((x) => x.id === id);
    expect(b.events[i - 1]!.id).toBe('semg');
    expect(b.events[i]!.name).toBe('סמינריון בנות (עותק)');
    expect(b.events[i]!.lines[0]!.id).not.toBe(ev(b, 'semg').lines[0]!.id);
    const R = compute(b);
    near(R.ev[id]!.exp, R.ev['semg']!.exp);
    near(R.tot.exp, TOTAL_EXP + evExp('semg'));
  });

  it('category fields: period, code, 2026 numbers', () => {
    const b = loadSeed();
    const c = ev(b, 'wkb').cats[0]!;
    E.setCategoryField(b, 'wkb', c.id, 'period', '3');
    expect(c.period).toBe(3);
    E.setCategoryField(b, 'wkb', c.id, 'period', 'שנתי');
    expect(c.period).toBe('שנתי');
    E.setCategoryField(b, 'wkb', c.id, 'period', '13');
    expect(c.period).toBe('');
    E.setCategoryField(b, 'wkb', c.id, 'code', ' 8.83.910-1 ');
    expect(c.code).toBe('8.83.910-1');
    E.setCategoryField(b, 'wkb', c.id, 'plan', '12,500');
    expect(c.plan).toBe(12500);
    E.setCategoryField(b, 'wkb', c.id, 'act', '');
    expect(c.act).toBeNull();
  });

  it('event fields and order', () => {
    const b = loadSeed();
    E.setEventField(b, 'semb', 'active', false);
    expect(ev(b, 'semb').active).toBe(false);
    E.setEventField(b, 'semb', 'partKey', '');
    expect(ev(b, 'semb').partKey).toBeNull();
    const first = b.events[0]!.id;
    E.moveEvent(b, first, 1);
    expect(b.events[1]!.id).toBe(first);
    E.moveEvent(b, first, -5);
    expect(b.events[1]!.id).toBe(first);
  });

  it('unknown ids throw (programming errors), they never pass silently', () => {
    const b = loadSeed();
    expect(() => E.addLine(b, 'nope')).toThrow();
    expect(() => E.setLineField(b, 'semb', 'nope', 'qty', 1)).toThrow();
  });
});
