/**
 * Local storage in IndexedDB through Dexie (CLAUDE.md section 10).
 * Several budgets side by side; the open one is remembered in the meta table.
 * Everything stays in this browser. Backup is by JSON export.
 */

import Dexie, { type Table } from 'dexie';
import { migrate } from '../domain/migrate';
import type { Budget } from '../domain/types';

export interface BudgetRecord {
  id: string;
  name: string;
  updatedAt: number;
  data: Budget;
}

export interface BudgetListItem {
  id: string;
  name: string;
  updatedAt: number;
}

interface MetaRecord {
  key: string;
  value: string;
}

class BudgetDatabase extends Dexie {
  budgets!: Table<BudgetRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      budgets: 'id, updatedAt',
      meta: 'key',
    });
  }
}

/** What the store needs from storage. Tests and the in-memory fallback implement the same API. */
export interface BudgetRepo {
  list(): Promise<BudgetListItem[]>;
  load(id: string): Promise<Budget | null>;
  save(id: string, budget: Budget): Promise<void>;
  remove(id: string): Promise<void>;
  getCurrentId(): Promise<string | null>;
  setCurrentId(id: string): Promise<void>;
}

export const newBudgetId = (): string => 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

/** Plain JSON copy: drops immer's frozen proxies and anything IndexedDB can't clone. */
const plain = (b: Budget): Budget => JSON.parse(JSON.stringify(b)) as Budget;

const byNewest = (a: BudgetListItem, b: BudgetListItem): number => b.updatedAt - a.updatedAt;

export function createDexieRepo(dbName = 'ezra-budget-builder'): BudgetRepo {
  const db = new BudgetDatabase(dbName);
  return {
    async list() {
      const all = await db.budgets.toArray();
      return all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort(byNewest);
    },
    async load(id) {
      const rec = await db.budgets.get(id);
      return rec ? migrate(rec.data) : null;
    },
    async save(id, budget) {
      await db.budgets.put({ id, name: budget.name, updatedAt: Date.now(), data: plain(budget) });
    },
    async remove(id) {
      await db.budgets.delete(id);
    },
    async getCurrentId() {
      return (await db.meta.get('currentId'))?.value ?? null;
    },
    async setCurrentId(id) {
      await db.meta.put({ key: 'currentId', value: id });
    },
  };
}

/** Used when IndexedDB is not available (some private modes). Nothing survives a reload. */
export function createMemoryRepo(): BudgetRepo {
  const rows = new Map<string, BudgetRecord>();
  let current: string | null = null;
  return {
    async list() {
      return [...rows.values()].map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort(byNewest);
    },
    async load(id) {
      const r = rows.get(id);
      return r ? migrate(plain(r.data)) : null;
    },
    async save(id, budget) {
      rows.set(id, { id, name: budget.name, updatedAt: Date.now(), data: plain(budget) });
    },
    async remove(id) {
      rows.delete(id);
    },
    async getCurrentId() {
      return current;
    },
    async setCurrentId(id) {
      current = id;
    },
  };
}

/** Ask the browser not to evict our data (navigator.storage.persist). */
export async function requestPersistentStorage(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}
