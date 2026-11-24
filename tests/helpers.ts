import { expect } from 'vitest';
import demoExpected from './expected-demo.json';
import { loadSeed } from '../src/domain/seed';
import { migrate } from '../src/domain/migrate';
import type { Budget, BudgetEvent } from '../src/domain/types';

/**
 * Expected numbers for the built-in (example) template, computed by the prototype's engine
 * (scripts/make-demo.mjs). Tests use these instead of literal amounts, so no real budget
 * figure ever appears in the public repository.
 */
export const expected = demoExpected;
export type Expected = Omit<typeof demoExpected, '_note'>;
export { loadSeed };

/* The real template and its Excel-checked totals live in private/ (not committed). */
const privateFiles = import.meta.glob<unknown>('../private/*.json', { eager: true, import: 'default' });
const privateSeedJson = privateFiles['../private/seed-2027.json'];
const privateExpectedJson = privateFiles['../private/expected-totals.json'] as Expected | undefined;

/** The real template and its expected totals, or null when private/ is not present (e.g. on GitHub). */
export const privateFixture =
  privateSeedJson && privateExpectedJson
    ? { load: (): Budget => migrate(JSON.parse(JSON.stringify(privateSeedJson))), expected: privateExpectedJson }
    : null;

/** Assert |actual - expected| <= tol (default 0.01, as in CLAUDE.md section 13). */
export function near(actual: number | null | undefined, exp: number, tol = 0.01): void {
  expect(actual, `expected ${exp}, got ${actual}`).not.toBeNull();
  expect(Math.abs((actual as number) - exp), `expected ${exp}, got ${actual}`).toBeLessThanOrEqual(tol);
}

export function ev(b: Budget, id: string): BudgetEvent {
  const e = b.events.find((x) => x.id === id);
  if (!e) throw new Error('no event ' + id);
  return e;
}

export function setParam(b: Budget, evId: string, key: string, value: number | string): void {
  const p = ev(b, evId).params.find((x) => x.key === key);
  if (!p) throw new Error(`no param ${key} in ${evId}`);
  p.value = value;
}

/* Shorthands for the example template. */
export const TOTAL_EXP = expected.totals.expenses;
export const TOTAL_INC = expected.totals.income;
export const evExp = (id: keyof typeof expected.events): number => expected.events[id].expenses;
export const evInc = (id: keyof typeof expected.events): number => expected.events[id].income;
export const catAmount = (id: keyof typeof expected.events, cat: string): number =>
  (expected.events[id].categories as Record<string, number>)[cat]!;
