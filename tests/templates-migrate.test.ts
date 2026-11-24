import { describe, expect, it } from 'vitest';
import { compute } from '../src/domain/compute';
import { migrate, MigrateError } from '../src/domain/migrate';
import { addEvent } from '../src/domain/templates';
import { ev, evExp, loadSeed, near } from './helpers';

const allIds = (b: ReturnType<typeof loadSeed>): string[] => [
  ...b.prices.map((p) => p.id),
  ...b.salary.map((s) => s.id),
  ...b.events.flatMap((e) => [e.id, ...e.params.map((x) => x.id), ...e.income.map((x) => x.id), ...e.lines.map((x) => x.id), ...e.cats.map((x) => x.id)]),
];

describe('new event', () => {
  it('weekend template: same numbers as wkb, 2026 data and notes cleared, fresh unique ids', () => {
    const b = loadSeed();
    const seed = loadSeed();
    const id = addEvent(b, seed, { kind: 'weekend' }, 'שבת חדשה');
    const e = ev(b, id);
    expect(e.name).toBe('שבת חדשה');
    expect(e.active).toBe(true);
    expect(e.sub).toBe('');
    expect(e.notes).toEqual([]);
    expect(e.cats.every((c) => c.plan === null && c.act === null)).toBe(true);
    expect(e.incPlan).toBeNull();
    const ids = allIds(b);
    expect(new Set(ids).size).toBe(ids.length);
    const newIds = [e.id, ...e.params.map((x) => x.id), ...e.income.map((x) => x.id), ...e.lines.map((x) => x.id), ...e.cats.map((x) => x.id)];
    expect(newIds.every((x) => /^[a-z]\d+$/.test(x))).toBe(true);
    expect(b.nextId).toBe(loadSeed().nextId + newIds.length);
    const R = compute(b);
    near(R.ev[id]!.exp, R.ev['wkb']!.exp);
    near(R.ev[id]!.plan26, 0);
  });

  it('seminar template comes from the seed, not from the open budget', () => {
    const b = loadSeed();
    ev(b, 'semb').params.find((p) => p.key === 'חניכים')!.value = 10;
    const id = addEvent(b, loadSeed(), { kind: 'seminar' }, 'סמינר');
    near(compute(b).ev[id]!.exp, evExp('semb'));
  });

  it('copy keeps everything but ids and name', () => {
    const b = loadSeed();
    const id = addEvent(b, loadSeed(), { kind: 'copy', evId: 'masa' }, 'מסע 2');
    const e = ev(b, id);
    expect(e.cats.map((c) => c.plan)).toEqual(ev(b, 'masa').cats.map((c) => c.plan));
    near(compute(b).ev[id]!.exp, evExp('masa'));
  });

  it('blank event computes without errors', () => {
    const b = loadSeed();
    const id = addEvent(b, loadSeed(), { kind: 'blank' }, '');
    const e = ev(b, id);
    expect(e.name).toBe('מפעל חדש');
    const E = compute(b).ev[id]!;
    expect(E.exp).toBe(0);
    expect(E.part).toBe(100);
    expect(E.issues.filter((i) => i.kind.endsWith('error'))).toEqual([]);
  });
});

describe('migrate', () => {
  it('rejects files that are not budgets', () => {
    expect(() => migrate(null)).toThrow(MigrateError);
    expect(() => migrate({ events: [] })).toThrow('הקובץ לא נראה כמו גיבוי של הכלי');
    expect(() => migrate({ globals: {} })).toThrow(MigrateError);
    expect(() => migrate([1, 2])).toThrow(MigrateError);
  });

  it('rejects files from a newer schema', () => {
    expect(() => migrate({ schema: 99, events: [], globals: {} })).toThrow('הקובץ נוצר בגרסה חדשה יותר של הכלי');
  });

  it('fills defaults for a minimal file', () => {
    const b = migrate({
      globals: { התייקרות: 0, בלתם: 0.07 },
      events: [{ name: 'א', cats: [{ name: 'ציוד', period: '3' }], lines: [{ cat: 'ציוד', qty: 2, price: 50 }] }],
    });
    expect(b.schema).toBe(1);
    expect(b.prices).toEqual([]);
    const e = b.events[0]!;
    expect(e.active).toBe(true);
    expect(e.id).toMatch(/^e\d+$/);
    expect(e.cats[0]!.period).toBe(3);
    expect(e.lines[0]!.days).toBe('');
    expect(e.partKey).toBeNull();
    const R = compute(b);
    expect(R.ev[e.id]!.exp).toBe(100);
  });

  it('fixes duplicate ids and keeps nextId ahead of every id', () => {
    const b = migrate({
      nextId: 5,
      globals: {},
      events: [
        { id: 'e900', params: [{ id: 'p1', key: 'א', value: 1 }, { id: 'p1', key: 'ב', value: 2 }] },
        { id: 'e900' },
      ],
    });
    const ids = allIds(b);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.nextId).toBeGreaterThan(900);
  });
});
