/**
 * App state: the open budget, the list of saved budgets and the save status.
 * Zustand + immer. Autosave to the repo 1.5 seconds after the last change (CLAUDE.md section 10).
 *
 * All budget edits go through update(), which also keeps the undo history (CLAUDE.md section 9):
 * immutable snapshots (immer shares unchanged parts), at most HISTORY_LIMIT steps.
 * Keystrokes in the same field within COALESCE_MS of each other merge into one step.
 * Editing logic itself lives in domain/edit.ts, domain/rename.ts and domain/templates.ts.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import * as E from '../domain/edit';
import { migrate, MigrateError } from '../domain/migrate';
import { renameCategory, renameParam, renamePrice, renameSalaryRow, type RenameResult } from '../domain/rename';
import { addEvent, clone, type EventSource } from '../domain/templates';
import type { Budget, Level, Val } from '../domain/types';
import { createMemoryRepo, newBudgetId, type BudgetListItem, type BudgetRepo } from './db';

export type SaveStatus = 'loading' | 'dirty' | 'saving' | 'saved' | 'error';

export const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: 'טוען',
  dirty: 'יש שינויים',
  saving: 'שומר',
  saved: 'נשמר',
  error: 'השמירה נכשלה',
};

export const SAVE_DELAY_MS = 1500;
export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 1500;

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface StoreDeps {
  repo: BudgetRepo;
  /** A fresh copy of the starting template. */
  seed: () => Budget;
  saveDelay?: number;
  timers?: Timers;
  /** Clock for merging keystrokes into one undo step (tests pass a fake one). */
  now?: () => number;
}

export interface BudgetState {
  budget: Budget | null;
  budgetId: string | null;
  budgets: BudgetListItem[];
  status: SaveStatus;
  /** Shown to the user when storage is unavailable or a save failed. */
  storageError: string | null;
  canUndo: boolean;
  canRedo: boolean;

  init(): Promise<void>;
  /** Save now if there are pending changes (before switching budgets, closing the tab...). */
  flush(): Promise<void>;
  /**
   * Apply an edit to the open budget. No-op if nothing changed.
   * Edits with the same coalesceKey in quick succession form one undo step.
   */
  update(recipe: (draft: Budget) => void, coalesceKey?: string): void;
  undo(): boolean;
  redo(): boolean;

  /* budgets */
  switchBudget(id: string): Promise<void>;
  createBudget(from: 'template' | 'copy', name: string): Promise<string>;
  importBudget(raw: unknown): Promise<string>;
  deleteBudget(id: string): Promise<void>;
  resetToTemplate(): void;

  /* edits */
  setBudgetName(name: string): void;
  setGlobal(key: string, value: Val): void;

  addPrice(): string;
  setPriceField(id: string, field: 'label' | 'unit' | 'value', value: Val): void;
  renamePrice(id: string, key: string): RenameResult;
  deletePrice(id: string): void;

  addSalaryRow(): string;
  setSalaryField(id: string, field: 'name' | 'note' | 'hours', value: Val): void;
  setSalaryLevel(id: string, level: Level, value: Val): void;
  /** Rename a salary row and update every שכר("old") formula. */
  renameSalaryRow(id: string, name: string): RenameResult;
  deleteSalaryRow(id: string): void;

  addEvent(source: EventSource, name: string): string;
  duplicateEvent(evId: string): string;
  deleteEvent(evId: string): void;
  moveEvent(evId: string, delta: number): void;
  setEventField(evId: string, field: E.EventField, value: string | boolean | null): void;

  addParam(evId: string): string;
  setParamField(evId: string, id: string, field: 'value' | 'note', value: Val): void;
  renameParam(evId: string, id: string, key: string): RenameResult;
  deleteParam(evId: string, id: string): void;

  addIncome(evId: string): string;
  setIncomeField(evId: string, id: string, field: 'label' | 'note' | 'qty' | 'price', value: Val): void;
  deleteIncome(evId: string, id: string): void;

  addLine(evId: string, cat?: string): string;
  setLineField(evId: string, id: string, field: 'cat' | 'item' | 'note' | 'qty' | 'days' | 'price', value: Val): void;
  deleteLine(evId: string, id: string): void;

  addCategory(evId: string): string;
  addBlatCategory(evId: string): string;
  setCategoryField(evId: string, id: string, field: 'code' | 'period' | 'plan' | 'act', value: string | number | null): void;
  renameCategory(evId: string, id: string, name: string): RenameResult;
  deleteCategory(evId: string, id: string): void;
}

export type BudgetStore = StoreApi<BudgetState>;

const NO_STORAGE = 'השמירה בדפדפן לא זמינה כאן. השינויים לא יישמרו אחרי רענון. כדאי לייצא גיבוי.';

function saveErrorText(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError' || /quota/i.test(name)) return 'אין מקום לשמירה בדפדפן. כדאי למחוק תקציבים ישנים או לייצא גיבוי.';
  return 'השמירה בדפדפן נכשלה. ננסה שוב בשינוי הבא. כדאי לייצא גיבוי.';
}

export function createBudgetStore(deps: StoreDeps): BudgetStore {
  const delay = deps.saveDelay ?? SAVE_DELAY_MS;
  const timers = deps.timers ?? realTimers;
  let repo = deps.repo;

  // Autosave bookkeeping. rev counts edits; savedRev is the last edit that reached storage.
  let rev = 0;
  let savedRev = 0;
  let timer: unknown = null;
  let chain: Promise<void> = Promise.resolve();
  let initPromise: Promise<void> | null = null;

  // Undo history of the open budget.
  const now = deps.now ?? (() => Date.now());
  let past: Budget[] = [];
  let future: Budget[] = [];
  let lastKey: string | null = null;
  let lastAt = 0;

  return createStore<BudgetState>()(
    immer((set, get) => {
      const scheduleSave = (): void => {
        if (timer !== null) timers.clear(timer);
        timer = timers.set(() => {
          timer = null;
          void saveNow();
        }, delay);
      };

      const cancelTimer = (): void => {
        if (timer !== null) timers.clear(timer);
        timer = null;
      };

      const doSave = async (): Promise<void> => {
        const { budget, budgetId } = get();
        if (!budget || !budgetId || rev === savedRev) return;
        const target = rev;
        set((s) => {
          s.status = 'saving';
        });
        try {
          await repo.save(budgetId, budget);
          savedRev = target;
          const list = await repo.list();
          set((s) => {
            s.budgets = list;
            s.status = rev === savedRev ? 'saved' : 'dirty';
            if (s.storageError !== NO_STORAGE) s.storageError = null;
          });
        } catch (e) {
          set((s) => {
            s.status = 'error';
            s.storageError = saveErrorText(e);
          });
        }
      };

      // Saves run one at a time, in order.
      const saveNow = (): Promise<void> => {
        chain = chain.then(doSave, doSave);
        return chain;
      };

      /** Replace the open budget (after switching, creating, importing). */
      const open = async (id: string, budget: Budget): Promise<void> => {
        cancelTimer();
        rev = 0;
        savedRev = 0;
        past = [];
        future = [];
        lastKey = null;
        await repo.setCurrentId(id);
        const list = await repo.list();
        set((s) => {
          s.budget = budget;
          s.budgetId = id;
          s.budgets = list;
          s.canUndo = false;
          s.canRedo = false;
          if (s.status !== 'error') s.status = 'saved';
        });
      };

      /** Save pending changes before leaving the open budget. Refuses to leave if they could not be saved. */
      const leaveCurrent = async (): Promise<void> => {
        cancelTimer();
        await saveNow();
        if (rev !== savedRev) throw new Error('השינויים בתקציב הפתוח לא נשמרו. כדאי לייצא גיבוי לפני שממשיכים.');
      };

      const mutate = <T>(fn: (d: Budget) => T, coalesceKey?: string): T => {
        let out: T | undefined;
        get().update((d) => {
          out = fn(d);
        }, coalesceKey);
        return out as T;
      };

      /** Move to another version of the budget (undo/redo). */
      const travel = (to: Budget): void => {
        lastKey = null;
        rev++;
        set((s) => {
          s.budget = to;
          s.status = 'dirty';
          s.canUndo = past.length > 0;
          s.canRedo = future.length > 0;
        });
        scheduleSave();
      };

      const rename = (fn: (d: Budget) => RenameResult): RenameResult => {
        // Validate on a copy first so a rejected rename leaves the state untouched.
        const b = get().budget;
        if (!b) return { ok: false, error: 'אין תקציב פתוח' };
        const res = fn(clone(b));
        if (res.ok) mutate(fn);
        return res;
      };

      return {
        budget: null,
        budgetId: null,
        budgets: [],
        status: 'loading',
        storageError: null,
        canUndo: false,
        canRedo: false,

        init() {
          initPromise ??= (async () => {
            try {
              await repo.list();
            } catch {
              repo = createMemoryRepo();
              set((s) => {
                s.storageError = NO_STORAGE;
              });
            }
            let id = await repo.getCurrentId();
            let budget: Budget | null = null;
            if (id) budget = await repo.load(id).catch(() => null);
            if (!budget) {
              for (const item of await repo.list()) {
                budget = await repo.load(item.id).catch(() => null);
                if (budget) {
                  id = item.id;
                  break;
                }
              }
            }
            if (!budget || !id) {
              // First run: start from the template.
              budget = deps.seed();
              id = newBudgetId();
              await repo.save(id, budget);
            }
            await open(id, budget);
          })();
          return initPromise;
        },

        async flush() {
          cancelTimer();
          await saveNow();
        },

        update(recipe, coalesceKey) {
          const prev = get().budget;
          if (!prev) return;
          set((s) => {
            if (s.budget) recipe(s.budget as Budget);
          });
          if (get().budget === prev) return;
          const t = now();
          const merge = coalesceKey !== undefined && coalesceKey === lastKey && t - lastAt < COALESCE_MS;
          if (!merge) {
            past.push(prev);
            if (past.length > HISTORY_LIMIT) past.shift();
          }
          future = [];
          lastKey = coalesceKey ?? null;
          lastAt = t;
          rev++;
          set((s) => {
            s.status = 'dirty';
            s.canUndo = past.length > 0;
            s.canRedo = false;
          });
          scheduleSave();
        },

        undo() {
          const cur = get().budget;
          const to = past.pop();
          if (!cur || !to) return false;
          future.push(cur);
          travel(to);
          return true;
        },

        redo() {
          const cur = get().budget;
          const to = future.pop();
          if (!cur || !to) return false;
          past.push(cur);
          travel(to);
          return true;
        },

        /* ---------------------------- budgets ---------------------------- */

        async switchBudget(id) {
          if (id === get().budgetId) return;
          await leaveCurrent();
          const budget = await repo.load(id);
          if (!budget) throw new Error('התקציב לא נמצא');
          await open(id, budget);
        },

        async createBudget(from, name) {
          await leaveCurrent();
          const cur = get().budget;
          const budget = from === 'copy' && cur ? clone(cur) : deps.seed();
          budget.name = name.trim() || 'תקציב חדש';
          const id = newBudgetId();
          await repo.save(id, budget);
          await open(id, budget);
          return id;
        },

        async importBudget(raw) {
          const budget = migrate(raw); // throws MigrateError with a Hebrew message
          budget.name = (budget.name || 'תקציב') + ' (ייבוא)';
          await leaveCurrent();
          const id = newBudgetId();
          await repo.save(id, budget);
          await open(id, budget);
          return id;
        },

        async deleteBudget(id) {
          if (id === get().budgetId) cancelTimer();
          await repo.remove(id);
          if (id !== get().budgetId) {
            const list = await repo.list();
            set((s) => {
              s.budgets = list;
            });
            return;
          }
          for (const item of await repo.list()) {
            const b = await repo.load(item.id).catch(() => null);
            if (b) return open(item.id, b);
          }
          const fresh = deps.seed();
          const newId = newBudgetId();
          await repo.save(newId, fresh);
          await open(newId, fresh);
        },

        resetToTemplate() {
          const name = get().budget?.name;
          const fresh = deps.seed();
          if (name) fresh.name = name;
          get().update((d) => {
            Object.assign(d, fresh);
          });
        },

        /* ----------------------------- edits ----------------------------- */

        setBudgetName: (name) => mutate((d) => E.setBudgetName(d, name), 'name'),
        setGlobal: (key, value) => mutate((d) => E.setGlobal(d, key, value), 'g:' + key),

        addPrice: () => mutate((d) => E.addPrice(d)),
        setPriceField: (id, field, value) => mutate((d) => E.setPriceField(d, id, field, value), `r:${id}:${field}`),
        renamePrice: (id, key) => rename((d) => renamePrice(d, id, key)),
        deletePrice: (id) => mutate((d) => E.deletePrice(d, id)),

        addSalaryRow: () => mutate((d) => E.addSalaryRow(d)),
        setSalaryField: (id, field, value) => mutate((d) => E.setSalaryField(d, id, field, value), `s:${id}:${field}`),
        setSalaryLevel: (id, level, value) => mutate((d) => E.setSalaryLevel(d, id, level, value), `s:${id}:${level}`),
        renameSalaryRow: (id, name) => rename((d) => renameSalaryRow(d, id, name)),
        deleteSalaryRow: (id) => mutate((d) => E.deleteSalaryRow(d, id)),

        addEvent: (source, name) => mutate((d) => addEvent(d, deps.seed(), source, name)),
        duplicateEvent: (evId) => mutate((d) => E.duplicateEvent(d, evId)),
        deleteEvent: (evId) => mutate((d) => E.deleteEvent(d, evId)),
        moveEvent: (evId, delta) => mutate((d) => E.moveEvent(d, evId, delta)),
        setEventField: (evId, field, value) =>
          mutate((d) => E.setEventField(d, evId, field, value), field === 'active' || field === 'partKey' ? undefined : `e:${evId}:${field}`),

        addParam: (evId) => mutate((d) => E.addParam(d, evId)),
        setParamField: (evId, id, field, value) => mutate((d) => E.setParamField(d, evId, id, field, value), `p:${id}:${field}`),
        renameParam: (evId, id, key) => rename((d) => renameParam(d, evId, id, key)),
        deleteParam: (evId, id) => mutate((d) => E.deleteParam(d, evId, id)),

        addIncome: (evId) => mutate((d) => E.addIncome(d, evId)),
        setIncomeField: (evId, id, field, value) => mutate((d) => E.setIncomeField(d, evId, id, field, value), `i:${id}:${field}`),
        deleteIncome: (evId, id) => mutate((d) => E.deleteIncome(d, evId, id)),

        addLine: (evId, cat) => mutate((d) => E.addLine(d, evId, cat)),
        setLineField: (evId, id, field, value) =>
          mutate((d) => E.setLineField(d, evId, id, field, value), field === 'cat' ? undefined : `l:${id}:${field}`),
        deleteLine: (evId, id) => mutate((d) => E.deleteLine(d, evId, id)),

        addCategory: (evId) => mutate((d) => E.addCategory(d, evId)),
        addBlatCategory: (evId) => mutate((d) => E.addBlatCategory(d, evId)),
        setCategoryField: (evId, id, field, value) =>
          mutate((d) => E.setCategoryField(d, evId, id, field, value), field === 'period' ? undefined : `c:${id}:${field}`),
        renameCategory: (evId, id, name) => rename((d) => renameCategory(d, evId, id, name)),
        deleteCategory: (evId, id) => mutate((d) => E.deleteCategory(d, evId, id)),
      };
    }),
  );
}

export { MigrateError };
