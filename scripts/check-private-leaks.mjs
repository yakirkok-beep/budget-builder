/**
 * Before pushing: make sure no real budget figure or note from private/ is in a file git would publish.
 *
 *   node scripts/check-private-leaks.mjs            (before every push)
 *   node scripts/check-private-leaks.mjs --strict   (also round amounts, for a manual review)
 *
 * Collects amounts from private/seed-2027.json and private/expected-totals.json (2026 plan/actuals,
 * salaries, prices, literal line amounts, money params, expected totals) and every note text,
 * then searches all tracked and not-ignored files. Also compares the example template field by field:
 * no sensitive field may keep its real value. Exits 1 if anything is found.
 * A line can be excluded with the marker "leak-check: ignore" (for unrelated constants).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** --strict: also round amounts (many false positives; for a manual review). */
const STRICT = process.argv.includes('--strict');
const seedPath = join(root, 'private/seed-2027.json');
if (!existsSync(seedPath)) {
  console.log('private/ not found: nothing to compare against.');
  process.exit(0);
}
const real = JSON.parse(readFileSync(seedPath, 'utf8'));
const expectedPath = join(root, 'private/expected-totals.json');
const expected = existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, 'utf8')) : {};

/* ---------------- what counts as sensitive ---------------- */
const numbers = new Map(); // value -> where it came from
const addNum = (v, where) => {
  if (typeof v !== 'number' || !isFinite(v)) return;
  const a = Math.abs(v);
  const isInt = Number.isInteger(v);
  // skip small or round values: they appear everywhere (counts, sizes, test inputs, constants).
  // Round amounts are still covered by the field-by-field check of the example template below.
  if (STRICT) {
    if (a >= 100 && !numbers.has(v)) numbers.set(v, where);
    return;
  }
  const keep = (isInt && a >= 1000 && a % 100 !== 0) || (isInt && a >= 100 && a < 1000 && a % 10 !== 0) || (!isInt && a >= 10);
  if (keep && !numbers.has(v)) numbers.set(v, where);
};
const texts = new Map();
/** Only notes that mention an amount (years like 2026 don't count). */
const addText = (t, where) => {
  if (typeof t !== 'string') return;
  const amounts = t.replace(/\b20[2-3]\d\b/g, '').match(/\d[\d,]{2,}/g);
  if (amounts && t.trim().length >= 8) texts.set(t.trim(), where);
};
const MONEY_PARAM = /מאבטח|מחיר|עלות|שכר|דמי|תשלום/;
const numsInFormula = (f) =>
  typeof f === 'string' ? [...f.matchAll(/(?<![\p{L}\p{N}_.])(\d+(?:\.\d+)?)(?![\p{L}\p{N}_.])/gu)].map((m) => Number(m[1])) : [];

for (const p of real.prices) {
  addNum(p.value, 'price ' + p.key);
  numsInFormula(p.value).forEach((n) => addNum(n, 'price ' + p.key));
}
for (const s of real.salary) {
  Object.values(s.levels).forEach((v) => addNum(v, 'salary ' + s.name));
  addText(s.note, 'salary note');
}
for (const ev of real.events) {
  addNum(ev.incPlan, ev.id + ' incPlan');
  addNum(ev.incAct, ev.id + ' incAct');
  ev.notes.forEach((n) => addText(n, ev.id + ' note'));
  for (const c of ev.cats) {
    addNum(c.plan, `${ev.id} ${c.name} plan`);
    addNum(c.act, `${ev.id} ${c.name} act`);
  }
  for (const p of ev.params) {
    addText(p.note, ev.id + ' param note');
    if (MONEY_PARAM.test(p.key)) addNum(p.value, `${ev.id} param ${p.key}`);
  }
  for (const l of ev.lines) {
    addText(l.note, ev.id + ' line note');
    addNum(l.price, `${ev.id} line ${l.item}`);
    numsInFormula(l.price).forEach((n) => addNum(n, `${ev.id} line ${l.item}`));
  }
  for (const i of ev.income) {
    addText(i.note, ev.id + ' income note');
    addNum(i.price, `${ev.id} income ${i.label}`);
  }
}
const walk = (o, path) => {
  if (/participants/.test(path)) return; // counts, not money
  if (typeof o === 'number') {
    addNum(o, 'expected ' + path);
    addNum(Math.round(o), 'expected (rounded) ' + path);
  } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path + '.' + k);
};
walk(expected, 'totals');
Object.values(real.globalNotes ?? {}).forEach((t) => addText(t, 'global note'));

/* ---------------- forms a number can take in a file ---------------- */
const withCommas = (s) => s.replace(/^(\d+)/, (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const patterns = [];
for (const [v, where] of numbers) {
  const plain = String(v);
  const forms = new Set([plain, withCommas(plain)]);
  for (const f of forms) {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push({ re: new RegExp(`(?<![\\w.,])${esc}(?![\\w]|[.,]\\d)`), label: `${f}  (${where})` });
  }
}

/* ---------------- files that would be published ---------------- */
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && existsSync(join(root, f))); // skip files deleted from the working tree
const hits = [];
for (const f of files) {
  if (/^(private|reference)\//.test(f) || /\.(xlsx|bundle)$/i.test(f)) hits.push(`${f}: this file must not be published`);
  if (/\.(png|jpg|ico|woff2?|lock)$/i.test(f) || f === 'package-lock.json') continue;
  // the example template is made of round made-up values; it is checked field by field below instead
  if (f === 'data/seed-demo.json') continue;
  const text = readFileSync(join(root, f), 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('leak-check: ignore')) return;
    for (const p of patterns) if (p.re.test(line)) hits.push(`${f}:${i + 1}: ${p.label}`);
    for (const [t, where] of texts) if (line.includes(t)) hits.push(`${f}:${i + 1}: note text (${where})`);
  });
}

/* ---------------- the example template, field by field ---------------- */
const demoPath = join(root, 'data/seed-demo.json');
if (existsSync(demoPath)) {
  const demo = JSON.parse(readFileSync(demoPath, 'utf8'));
  const same = (a, b, where) => {
    if (typeof a === 'number' && a !== 0 && a === b) hits.push(`data/seed-demo.json: ${where} still has its real value ${a}`);
    if (typeof a === 'string' && a.trim().startsWith('=') && /\d{2,}/.test(a) && a === b) hits.push(`data/seed-demo.json: ${where} still has its real formula ${a}`);
  };
  const byKey = new Map(real.prices.map((p) => [p.key, p]));
  for (const p of demo.prices) same(byKey.get(p.key)?.value, p.value, 'price ' + p.key);
  const salByName = new Map(real.salary.map((r) => [r.name, r]));
  for (const r of demo.salary) for (const [l, v] of Object.entries(r.levels)) same(salByName.get(r.name)?.levels[l], v, `salary ${r.name} ${l}`);
  for (const ev of demo.events) {
    const rev = real.events.find((e) => e.id === ev.id);
    if (!rev) continue;
    if (ev.incPlan != null || ev.incAct != null) hits.push(`data/seed-demo.json: ${ev.id} has 2026 income numbers`);
    if (ev.notes.length) hits.push(`data/seed-demo.json: ${ev.id} has notes`);
    for (const c of ev.cats) if (c.plan != null || c.act != null) hits.push(`data/seed-demo.json: ${ev.id} ${c.name} has 2026 numbers`);
    const lines = new Map(rev.lines.map((l) => [l.id, l]));
    for (const l of ev.lines) {
      same(lines.get(l.id)?.price, l.price, `${ev.id} line "${l.item}" price`);
      if (l.note) hits.push(`data/seed-demo.json: ${ev.id} line "${l.item}" has a note`);
    }
    const inc = new Map(rev.income.map((i) => [i.id, i]));
    for (const i of ev.income) {
      same(inc.get(i.id)?.price, i.price, `${ev.id} income "${i.label}" price`);
      if (i.note) hits.push(`data/seed-demo.json: ${ev.id} income "${i.label}" has a note`);
    }
    const params = new Map(rev.params.map((x) => [x.key, x]));
    for (const x of ev.params) {
      if (MONEY_PARAM.test(x.key) && typeof x.value === 'number' && x.value >= 10) same(params.get(x.key)?.value, x.value, `${ev.id} param ${x.key}`);
      if (x.note) hits.push(`data/seed-demo.json: ${ev.id} param ${x.key} has a note`);
    }
  }
  for (const r of demo.salary) if (r.note) hits.push(`data/seed-demo.json: salary ${r.name} has a note`);
}

console.log(`checked ${files.length} files for ${numbers.size} amounts and ${texts.size} note texts from private/`);
if (hits.length) {
  console.log('\nFOUND:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('no private data found');
