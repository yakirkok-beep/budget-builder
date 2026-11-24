import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { compute } from '../src/domain/compute';
import { MigrateError } from '../src/domain/migrate';
import { createBudgetStore, HISTORY_LIMIT, type Timers } from '../src/store/budgetStore';
import { createDexieRepo, createMemoryRepo, type BudgetRepo } from '../src/store/db';
import type { Budget } from '../src/domain/types';
import { expected, loadSeed, near, TOTAL_EXP } from './helpers';

const S400 = expected.scenario_semb_400;
const INFL3 = expected.scenario_infl_3pct.expenses;
const SENIOR = expected.scenario_level_senior.expenses;

/** Timers we fire by hand, to test the 1.5 second debounce without waiting. */
function manualTimers(): Timers & { fire(): Promise<void>; pending: boolean; lastMs: number } {
  let fn: (() => void) | null = null;
  const t = {
    lastMs: 0,
    get pending() {
      return fn !== null;
    },
    set(f: () => void, ms: number) {
      fn = f;
      t.lastMs = ms;
      return 1;
    },
    clear() {
      fn = null;
    },
    async fire() {
      const f = fn;
      fn = null;
      f?.();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
  return t;
}

/** A repo that counts saves and can be told to fail. */
function spyRepo(inner: BudgetRepo = createMemoryRepo()) {
  const spy = {
    saves: 0,
    fail: false,
    gate: null as Promise<void> | null,
    repo: {
      ...inner,
      async save(id: string, b: Budget) {
        if (spy.gate) await spy.gate;
        if (spy.fail) throw Object.assign(new Error('boom'), { name: 'QuotaExceededError' });
        spy.saves++;
        return inner.save(id, b);
      },
    } as BudgetRepo,
  };
  return spy;
}

const dbName = (): string => 'test-' + Math.random().toString(36).slice(2);
const sembKids = (b: Budget) => b.events.find((e) => e.id === 'semb')!.params.find((p) => p.key === 'חניכים')!;

describe('first run and reload (IndexedDB)', () => {
  it('first run loads the seed and saves it', async () => {
    const repo = createDexieRepo(dbName());
    const store = createBudgetStore({ repo, seed: loadSeed });
    expect(store.getState().status).toBe('loading');
    await store.getState().init();
    const s = store.getState();
    expect(s.status).toBe('saved');
    expect(s.budget!.name).toBe(loadSeed().name);
    near(compute(s.budget!).tot.exp, TOTAL_EXP);
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.getCurrentId()).toBe(s.budgetId);
    expect(s.budgets.map((x) => x.id)).toEqual([s.budgetId]);
  });

  it('a change survives a reload', async () => {
    const name = dbName();
    const a = createBudgetStore({ repo: createDexieRepo(name), seed: loadSeed });
    await a.getState().init();
    a.getState().setParamField('semb', sembKids(a.getState().budget!).id, 'value', '400');
    expect(a.getState().status).toBe('dirty');
    await a.getState().flush();
    expect(a.getState().status).toBe('saved');

    // "reload": a new store on the same database
    const b = createBudgetStore({ repo: createDexieRepo(name), seed: loadSeed });
    await b.getState().init();
    expect(b.getState().budgetId).toBe(a.getState().budgetId);
    expect(sembKids(b.getState().budget!).value).toBe(400);
    const E = compute(b.getState().budget!).ev['semb']!;
    near(E.exp, S400.expenses);
    near(E.inc, S400.income);
  });

  it('init twice does not create two budgets', async () => {
    const repo = createDexieRepo(dbName());
    const store = createBudgetStore({ repo, seed: loadSeed });
    await Promise.all([store.getState().init(), store.getState().init()]);
    expect(await repo.list()).toHaveLength(1);
  });

  it('falls back to memory when IndexedDB is not available', async () => {
    const broken: BudgetRepo = { ...createMemoryRepo(), list: () => Promise.reject(new Error('MissingAPIError')) };
    const store = createBudgetStore({ repo: broken, seed: loadSeed });
    await store.getState().init();
    expect(store.getState().budget).not.toBeNull();
    expect(store.getState().storageError).toMatch(/השמירה בדפדפן לא זמינה/);
    store.getState().setGlobal('התייקרות', 0.03);
    await store.getState().flush();
    near(compute(store.getState().budget!).tot.exp, INFL3);
  });

  it('a broken saved record does not block the app', async () => {
    const name = dbName();
    const repo = createDexieRepo(name);
    await repo.save('bad', { nonsense: true } as unknown as Budget);
    await repo.setCurrentId('bad');
    const store = createBudgetStore({ repo, seed: loadSeed });
    await store.getState().init();
    near(compute(store.getState().budget!).tot.exp, TOTAL_EXP);
    expect(store.getState().budgetId).not.toBe('bad');
  });
});

describe('autosave', () => {
  it('saves once, 1.5 seconds after the last change', async () => {
    const spy = spyRepo();
    const timers = manualTimers();
    const store = createBudgetStore({ repo: spy.repo, seed: loadSeed, timers });
    await store.getState().init();
    const firstRunSaves = spy.saves;

    store.getState().setGlobal('התייקרות', 0.01);
    store.getState().setGlobal('התייקרות', 0.02);
    store.getState().setGlobal('התייקרות', 0.03);
    expect(store.getState().status).toBe('dirty');
    expect(timers.pending).toBe(true);
    expect(timers.lastMs).toBe(1500);
    expect(spy.saves).toBe(firstRunSaves);

    await timers.fire();
    await store.getState().flush();
    expect(spy.saves).toBe(firstRunSaves + 1);
    expect(store.getState().status).toBe('saved');
  });

  it('status goes dirty -> saving -> saved, and stays dirty if edited during a save', async () => {
    const spy = spyRepo();
    const timers = manualTimers();
    const store = createBudgetStore({ repo: spy.repo, seed: loadSeed, timers });
    await store.getState().init();
    const seen: string[] = [];
    store.subscribe((s) => seen.push(s.status));

    let open!: () => void;
    spy.gate = new Promise<void>((r) => (open = r));
    store.getState().setBudgetName('א');
    const saving = store.getState().flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().status).toBe('saving');
    store.getState().setBudgetName('ב'); // edit while saving
    open();
    spy.gate = null;
    await saving;
    expect(store.getState().status).toBe('dirty');
    await store.getState().flush();
    expect(store.getState().status).toBe('saved');
    expect(seen).toEqual(expect.arrayContaining(['dirty', 'saving', 'saved']));
    expect(store.getState().budgets[0]!.name).toBe('ב');
  });

  it('an edit that changes nothing does not mark dirty', async () => {
    const timers = manualTimers();
    const store = createBudgetStore({ repo: createMemoryRepo(), seed: loadSeed, timers });
    await store.getState().init();
    store.getState().setGlobal('התייקרות', 0); // already 0
    expect(store.getState().status).toBe('saved');
    expect(timers.pending).toBe(false);
  });

  it('a rejected rename changes nothing', async () => {
    const store = createBudgetStore({ repo: createMemoryRepo(), seed: loadSeed, timers: manualTimers() });
    await store.getState().init();
    const before = store.getState().budget;
    const p = sembKids(before!);
    expect(store.getState().renameParam('semb', p.id, 'מנחים')).toEqual({ ok: false, error: 'כבר יש פרמטר בשם הזה' });
    expect(store.getState().budget).toBe(before);
    expect(store.getState().status).toBe('saved');
    expect(store.getState().renameParam('semb', p.id, 'נערים')).toEqual({ ok: true, key: 'נערים' });
    expect(store.getState().budget!.events.find((e) => e.id === 'semb')!.partKey).toBe('נערים');
  });

  it('a failed save shows an error, and the next good save clears it', async () => {
    const spy = spyRepo();
    const store = createBudgetStore({ repo: spy.repo, seed: loadSeed, timers: manualTimers() });
    await store.getState().init();
    spy.fail = true;
    store.getState().setBudgetName('x');
    await store.getState().flush();
    expect(store.getState().status).toBe('error');
    expect(store.getState().storageError).toMatch(/אין מקום/);
    spy.fail = false;
    store.getState().setBudgetName('y');
    await store.getState().flush();
    expect(store.getState().status).toBe('saved');
    expect(store.getState().storageError).toBeNull();
  });

  it('the store keeps budgets immutable (old versions are not changed)', async () => {
    const store = createBudgetStore({ repo: createMemoryRepo(), seed: loadSeed, timers: manualTimers() });
    await store.getState().init();
    const v1 = store.getState().budget!;
    store.getState().setParamField('semb', sembKids(v1).id, 'value', 400);
    const v2 = store.getState().budget!;
    expect(v2).not.toBe(v1);
    expect(sembKids(v1).value).toBe(350);
    expect(sembKids(v2).value).toBe(400);
    // untouched events keep their identity (cheap re-render checks)
    expect(v2.events.find((e) => e.id === 'masa')).toBe(v1.events.find((e) => e.id === 'masa'));
  });
});

describe('several budgets', () => {
  it('create, switch, delete', async () => {
    const repo = createDexieRepo(dbName());
    const store = createBudgetStore({ repo, seed: loadSeed, timers: manualTimers() });
    await store.getState().init();
    const first = store.getState().budgetId!;
    store.getState().setGlobal('התייקרות', 0.03);

    const copy = await store.getState().createBudget('copy', 'תרחיש חיסכון');
    expect(store.getState().budgetId).toBe(copy);
    expect(store.getState().budget!.name).toBe('תרחיש חיסכון');
    near(compute(store.getState().budget!).tot.exp, INFL3); // copy includes the unsaved change
    expect(store.getState().budgets).toHaveLength(2);

    const fresh = await store.getState().createBudget('template', 'נקי');
    near(compute(store.getState().budget!).tot.exp, TOTAL_EXP);

    await store.getState().switchBudget(first);
    near(compute(store.getState().budget!).tot.exp, INFL3); // the change was saved before leaving
    expect(await repo.getCurrentId()).toBe(first);

    await store.getState().deleteBudget(fresh);
    expect(store.getState().budgetId).toBe(first);
    expect(store.getState().budgets.map((b) => b.id).sort()).toEqual([first, copy].sort());

    await store.getState().deleteBudget(first); // deleting the open one opens another
    expect(store.getState().budgetId).toBe(copy);
    await store.getState().deleteBudget(copy); // deleting the last one starts from the template
    expect(store.getState().budgets).toHaveLength(1);
    near(compute(store.getState().budget!).tot.exp, TOTAL_EXP);
  });

  it('import opens the file as a new budget; bad files are rejected', async () => {
    const store = createBudgetStore({ repo: createMemoryRepo(), seed: loadSeed, timers: manualTimers() });
    await store.getState().init();
    const original = store.getState().budgetId;
    await expect(store.getState().importBudget({ hello: 1 })).rejects.toBeInstanceOf(MigrateError);
    expect(store.getState().budgetId).toBe(original);

    const file = loadSeed();
    file.globals['רמת_שכר'] = 'בכיר';
    const id = await store.getState().importBudget(JSON.parse(JSON.stringify(file)));
    expect(store.getState().budgetId).toBe(id);
    expect(store.getState().budget!.name).toBe(file.name + ' (ייבוא)');
    near(compute(store.getState().budget!).tot.exp, SENIOR);
    expect(store.getState().budgets).toHaveLength(2);
  });

  it('reset to template keeps the name', async () => {
    const store = createBudgetStore({ repo: createMemoryRepo(), seed: loadSeed, timers: manualTimers() });
    await store.getState().init();
    store.getState().setBudgetName('שלי');
    store.getState().setGlobal('התייקרות', 0.05);
    store.getState().resetToTemplate();
    expect(store.getState().budget!.name).toBe('שלי');
    near(compute(store.getState().budget!).tot.exp, TOTAL_EXP);
    expect(store.getState().status).toBe('dirty');
  });
});

describe('undo / redo', () => {
  async function setup() {
    let t = 1_000_000;
    const clock = { now: () => t, tick: (ms: number) => (t += ms) };
    const store = createBudgetStore({ repo: createMemoryRepo(), seed: loadSeed, timers: manualTimers(), now: clock.now });
    await store.getState().init();
    const kidsId = sembKids(store.getState().budget!).id;
    const kids = () => sembKids(store.getState().budget!).value;
    return { store, clock, kidsId, kids, s: () => store.getState() };
  }

  it('typing in one field is a single undo step', async () => {
    const { s, clock, kidsId, kids } = await setup();
    expect(s().canUndo).toBe(false);
    for (const v of ['4', '40', '400']) {
      s().setParamField('semb', kidsId, 'value', v);
      clock.tick(200);
    }
    expect(kids()).toBe(400);
    expect(s().canUndo).toBe(true);
    expect(s().undo()).toBe(true);
    expect(kids()).toBe(350);
    expect(s().canUndo).toBe(false);
    expect(s().canRedo).toBe(true);
    expect(s().redo()).toBe(true);
    expect(kids()).toBe(400);
  });

  it('a pause or another field starts a new step', async () => {
    const { s, clock, kidsId, kids } = await setup();
    s().setParamField('semb', kidsId, 'value', 360);
    clock.tick(5000); // pause
    s().setParamField('semb', kidsId, 'value', 370);
    clock.tick(100);
    s().setGlobal('התייקרות', 0.03); // another field
    s().undo();
    expect(s().budget!.globals['התייקרות']).toBe(0);
    expect(kids()).toBe(370);
    s().undo();
    expect(kids()).toBe(360);
    s().undo();
    expect(kids()).toBe(350);
    expect(s().undo()).toBe(false);
  });

  it('structural edits are steps; a new edit clears redo', async () => {
    const { s } = await setup();
    const n = s().budget!.events.length;
    s().addEvent({ kind: 'blank' }, 'חדש');
    s().deleteEvent('masa');
    expect(s().budget!.events).toHaveLength(n);
    s().undo();
    expect(s().budget!.events.some((e) => e.id === 'masa')).toBe(true);
    s().setBudgetName('x');
    expect(s().canRedo).toBe(false);
    s().undo();
    s().undo();
    expect(s().budget!.events).toHaveLength(n);
    near(compute(s().budget!).tot.exp, TOTAL_EXP);
  });

  it('undoing a rename restores every formula', async () => {
    const { s, kidsId } = await setup();
    const before = JSON.stringify(s().budget!.events.find((e) => e.id === 'semb'));
    expect(s().renameParam('semb', kidsId, 'נערים').ok).toBe(true);
    s().undo();
    expect(JSON.stringify(s().budget!.events.find((e) => e.id === 'semb'))).toBe(before);
    // a rejected rename adds no step
    expect(s().renameParam('semb', kidsId, 'מנחים').ok).toBe(false);
    expect(s().canUndo).toBe(false);
  });

  it('reset to template can be undone', async () => {
    const { s, kidsId, kids } = await setup();
    s().setParamField('semb', kidsId, 'value', 500);
    s().resetToTemplate();
    expect(kids()).toBe(350);
    s().undo();
    expect(kids()).toBe(500);
  });

  it(`keeps at least 50 steps (limit ${HISTORY_LIMIT})`, async () => {
    // one distinct, separated edit per step (same-field typing would merge into one step)
    const store2 = await setup();
    const ids = store2.s().budget!.prices.map((p) => p.id);
    let steps = 0;
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      store2.s().setPriceField(ids[i % ids.length]!, 'value', 1000 + i);
      store2.clock.tick(2000);
    }
    while (store2.s().undo()) steps++;
    expect(steps).toBe(HISTORY_LIMIT);
    expect(steps).toBeGreaterThanOrEqual(50);
  });

  it('undo marks dirty and is saved; switching budgets clears the history', async () => {
    const repo = createMemoryRepo();
    const store = createBudgetStore({ repo, seed: loadSeed, timers: manualTimers() });
    await store.getState().init();
    const s = () => store.getState();
    s().setGlobal('התייקרות', 0.03);
    await s().flush();
    s().undo();
    expect(s().status).toBe('dirty');
    await s().flush();
    expect((await repo.load(s().budgetId!))!.globals['התייקרות']).toBe(0);
    s().setGlobal('התייקרות', 0.02);
    await s().createBudget('template', 'אחר');
    expect(s().canUndo).toBe(false);
    expect(s().undo()).toBe(false);
  });
});
