/**
 * Numbers the e2e tests expect on screen, computed from the built-in example template and
 * formatted the way the UI shows them. (Calculation correctness itself is covered by the
 * acceptance tests; here we check that the UI shows, saves and restores the right numbers.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as C from '../../src/domain/clipboard';
import { compute } from '../../src/domain/compute';
import { migrate } from '../../src/domain/migrate';
import type { Budget } from '../../src/domain/types';
import { fmt, fmtS } from '../../src/ui/format';

// read the template as a file (Playwright runs from the project root; no JSON module import needed)
const seedJson: unknown = JSON.parse(readFileSync(join(process.cwd(), 'data', 'seed-demo.json'), 'utf8'));
const loadSeed = (): Budget => migrate(JSON.parse(JSON.stringify(seedJson)));

function run(mutate?: (b: Budget) => void) {
  const b = loadSeed();
  mutate?.(b);
  return compute(b);
}

const setKids = (b: Budget, v: number): void => {
  b.events.find((e) => e.id === 'semb')!.params.find((p) => p.key === 'חניכים')!.value = v;
};

const base = run();
const kids400 = run((b) => setKids(b, 400));
const infl3 = run((b) => (b.globals['התייקרות'] = 0.03));
const senior = run((b) => (b.globals['רמת_שכר'] = 'בכיר'));
const seed = loadSeed();

export const N = {
  /** ledger: total expenses of the template */
  total: fmt(base.tot.exp),
  /** the same, as plain text in the Priority TSV */
  totalTsv: String(Math.round(base.tot.exp * 100) / 100),
  totalRaw: base.tot.exp,
  /** חניכים in סמינריון בנים = 400 */
  kids400Total: fmt(kids400.tot.exp),
  kids400Exp: fmt(kids400.ev['semb']!.exp),
  kids400Inc: fmt(kids400.ev['semb']!.inc),
  /** סמינריון בנים left out */
  withoutSemb: fmt(base.tot.exp - base.ev['semb']!.exp),
  /** מסע גרעין deleted */
  withoutMasa: fmt(base.tot.exp - base.ev['masa']!.exp),
  /** התייקרות 3% */
  infl3Total: fmt(infl3.tot.exp),
  infl3Semb: fmt(infl3.ev['semb']!.exp),
  /** רמת שכר בכיר */
  seniorTotal: fmt(senior.tot.exp),
  /** שכר("סמינריון") at the default level */
  seminarWage: fmtS(Number(seed.salary.find((r) => r.name === 'סמינריון')!.levels['מתחיל'])),
  /** name of the template budget */
  templateName: seed.name,
};

/* ---------- copy / move (transfer.spec.ts): the expected numbers come from the domain functions ---------- */
type LinesClip = Extract<C.Clip, { kind: 'lines' }>;
const ev = (b: Budget, id: string) => b.events.find((e) => e.id === id)!;
const lineIds = (b: Budget, evId: string, ...items: string[]): string[] => items.map((it) => ev(b, evId).lines.find((l) => l.item === it)!.id);
const catTotal = (mutate: (b: Budget) => void, evId: string, cat: string): string => {
  const b = loadSeed();
  mutate(b);
  const r = compute(b);
  return fmt(r.ev[evId]!.cats[ev(b, evId).cats.find((c) => c.name === cat)!.id]);
};
const ASHEL = 'אש"ל לשבת ומוצ"ש';

export const T = {
  ashel: ASHEL,
  devExp: fmt(base.ev['dev']!.exp),
  /** "שכתוב" in פיתוח הדרכה כללי duplicated */
  devDupExp: fmt(run((b) => C.duplicateLines(b, 'dev', lineIds(b, 'dev', 'שכתוב'))).ev['dev']!.exp),
  /** the אש"ל line of שבת בראשית pasted into פיתוח הדרכה כללי (its params come along) */
  devPasteAshelExp: fmt(run((b) => C.pasteLines(b, 'dev', C.copyLines(b, 'bereshit', lineIds(b, 'bereshit', ASHEL)) as LinesClip)).ev['dev']!.exp),
  /** "שכתוב" and "שונות" moved from פיתוח תכנים to מדיה */
  mediaBefore: catTotal(() => undefined, 'dev', 'מדיה'),
  mediaAfterMove: catTotal((b) => C.moveLines(b, 'dev', lineIds(b, 'dev', 'שכתוב', 'שונות'), { cat: 'מדיה' }), 'dev', 'מדיה'),
  /** "מנוי Canva" of פיתוח הדרכה כללי copied into חודש ארגון */
  irgunExp: fmt(base.ev['irgun']!.exp),
  irgunCanvaExp: fmt(run((b) => C.pasteLines(b, 'irgun', C.copyLines(b, 'dev', lineIds(b, 'dev', 'מנוי Canva')) as LinesClip)).ev['irgun']!.exp),
  devWithoutCanvaExp: fmt(run((b) => C.deleteLines(b, 'dev', lineIds(b, 'dev', 'מנוי Canva'))).ev['dev']!.exp),
  bereshitExp: fmt(base.ev['bereshit']!.exp),
};
