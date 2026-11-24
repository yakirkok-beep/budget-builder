/**
 * The app's single store instance, React hooks, and browser wiring
 * (save pending changes when the tab is hidden or closed).
 */

import { useStore } from 'zustand';
import { compute } from '../domain/compute';
import { loadSeed } from '../domain/seed';
import type { Budget, BudgetResult } from '../domain/types';
import { createBudgetStore, type BudgetState } from './budgetStore';
import { createDexieRepo } from './db';

export const budgetStore = createBudgetStore({ repo: createDexieRepo(), seed: loadSeed });

export function useBudgetStore<T>(selector: (s: BudgetState) => T): T {
  return useStore(budgetStore, selector);
}

/* One computation per budget version, shared by every component. */
const resultCache = new WeakMap<Budget, BudgetResult>();

export function resultOf(budget: Budget): BudgetResult {
  let r = resultCache.get(budget);
  if (!r) {
    r = compute(budget);
    resultCache.set(budget, r);
  }
  return r;
}

/** Computed results of the open budget (null while loading). */
export function useResult(): BudgetResult | null {
  const budget = useBudgetStore((s) => s.budget);
  return budget ? resultOf(budget) : null;
}

if (typeof document !== 'undefined') {
  const flush = (): void => {
    void budgetStore.getState().flush();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

export * from './budgetStore';
export { requestPersistentStorage, isStoragePersisted } from './db';
