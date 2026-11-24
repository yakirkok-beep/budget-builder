/**
 * Acceptance tests, CLAUDE.md section 13. They run on:
 *  - the real template (private/seed-2027.json) against private/expected-totals.json, checked against the
 *    Excel tool, whenever private/ is present (locally);
 *  - the example template (data/seed-demo.json) against tests/expected-demo.json, computed by the
 *    prototype's engine, always (also on GitHub).
 */
import { describe, expect, it } from 'vitest';
import { compute } from '../src/domain/compute';
import { migrate } from '../src/domain/migrate';
import type { Budget } from '../src/domain/types';
import { ev, expected, loadSeed, near, privateFixture, setParam, type Expected } from './helpers';

const fixtures: { name: string; load: () => Budget; exp: Expected }[] = [{ name: 'example template', load: loadSeed, exp: expected }];
if (privateFixture) fixtures.push({ name: 'real template (private)', load: privateFixture.load, exp: privateFixture.expected });

it.skipIf(privateFixture)('real template: private/ is not here, so only the example template is checked', () => {});

describe.each(fixtures)('$name', ({ load, exp }) => {
  describe('totals', () => {
    const b = load();
    const R = compute(b);

    it('total expenses, income and deficit', () => {
      near(R.tot.exp, exp.totals.expenses);
      near(R.tot.inc, exp.totals.income);
      near(R.tot.def, exp.totals.deficit);
    });

    it('covers every event', () => {
      expect(Object.keys(exp.events).sort()).toEqual(b.events.map((e) => e.id).sort());
    });

    describe.each(Object.entries(exp.events))('event %s', (id, x) => {
      const e = ev(b, id);
      const E = R.ev[id]!;

      it(`${x.name}: expenses, income, participants`, () => {
        expect(e.name).toBe(x.name);
        near(E.exp, x.expenses);
        near(E.inc, x.income);
        near(E.def, x.expenses - x.income);
        if (x.participants == null) expect(E.part).toBeNull();
        else near(E.part, x.participants);
      });

      it(`${x.name}: every category`, () => {
        const cats = x.categories as Record<string, number>;
        expect(e.cats.map((c) => c.name).sort()).toEqual(Object.keys(cats).sort());
        for (const c of e.cats) near(E.cats[c.id], cats[c.name]!);
      });

      it(`${x.name}: no uncategorized lines and no formula errors`, () => {
        expect(E.unassigned).toBe(0);
        expect(E.issues.filter((i) => i.kind.endsWith('error') || i.kind === 'uncategorized')).toEqual([]);
      });
    });
  });

  describe('scenarios', () => {
    it('חניכים in סמינריון בנים = 400', () => {
      const b = load();
      setParam(b, 'semb', 'חניכים', 400);
      const E = compute(b).ev['semb']!;
      near(E.exp, exp.scenario_semb_400.expenses);
      near(E.inc, exp.scenario_semb_400.income);
    });

    it('התייקרות 3% (as a number and as text "3%")', () => {
      const b = load();
      b.globals['התייקרות'] = 0.03;
      near(compute(b).tot.exp, exp.scenario_infl_3pct.expenses);
      b.globals['התייקרות'] = '3%';
      near(compute(b).tot.exp, exp.scenario_infl_3pct.expenses);
    });

    it('income has no inflation', () => {
      const b = load();
      b.globals['התייקרות'] = 0.03;
      near(compute(b).tot.inc, exp.totals.income);
    });

    it('רמת שכר "בכיר"', () => {
      const b = load();
      b.globals['רמת_שכר'] = 'בכיר';
      near(compute(b).tot.exp, exp.scenario_level_senior.expenses);
    });

    it('inactive events are left out of the totals', () => {
      const b = load();
      const before = compute(b);
      ev(b, 'semb').active = false;
      const after = compute(b);
      near(after.tot.exp, before.tot.exp - before.ev['semb']!.exp);
      near(after.tot.inc, before.tot.inc - before.ev['semb']!.inc);
      near(after.ev['semb']!.exp, exp.events.semb.expenses); // still computed for display
      expect(after.priority.rows.some((r) => r.ev === 'semb')).toBe(false);
      expect(after.issues.some((i) => i.ev === 'semb')).toBe(false);
    });
  });

  describe('JSON round trip', () => {
    it('export and load give the same numbers', () => {
      const b = load();
      b.globals['התייקרות'] = 0.02;
      setParam(b, 'masa', 'חניכים', 1100);
      const R1 = compute(b);
      const R2 = compute(migrate(JSON.parse(JSON.stringify(b))));
      expect(R2.tot).toEqual(R1.tot);
      for (const e of b.events) {
        expect(R2.ev[e.id]!.exp).toBe(R1.ev[e.id]!.exp);
        expect(R2.ev[e.id]!.inc).toBe(R1.ev[e.id]!.inc);
        expect(R2.ev[e.id]!.cats).toEqual(R1.ev[e.id]!.cats);
      }
      expect(R2.priority).toEqual(R1.priority);
    });

    it('migrate is stable on its own output', () => {
      const b = load();
      expect(migrate(JSON.parse(JSON.stringify(b)))).toEqual(b);
    });
  });

  describe('2026 comparison', () => {
    it('plan26/act26 are sums of category plan/act and do not affect 2027', () => {
      const b = load();
      const R = compute(b);
      const e = ev(b, 'semb');
      near(R.ev['semb']!.plan26, e.cats.reduce((s, c) => s + (c.plan ?? 0), 0));
      near(R.ev['semb']!.act26, e.cats.reduce((s, c) => s + (c.act ?? 0), 0));
      e.cats.forEach((c) => (c.plan = 999999));
      near(compute(b).ev['semb']!.plan26, 999999 * e.cats.length);
      near(compute(b).ev['semb']!.exp, exp.events.semb.expenses);
    });

    it('totals of 2026 include only active events', () => {
      const b = load();
      const R = compute(b);
      near(R.tot.plan26, b.events.filter((e) => e.active).reduce((s, e) => s + R.ev[e.id]!.plan26, 0));
    });
  });
});
