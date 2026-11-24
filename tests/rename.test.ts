import { describe, expect, it } from 'vitest';
import { compute } from '../src/domain/compute';
import { countNameUses, countSalaryUses, renameCategory, renameParam, renamePrice, renameSalaryRow, replaceIdent, replaceSalaryRef } from '../src/domain/rename';
import { ev, loadSeed, near } from './helpers';

const allFormulas = (e: ReturnType<typeof ev>): string[] =>
  [
    ...e.params.map((p) => p.value),
    ...e.lines.flatMap((l) => [l.qty, l.days, l.price]),
    ...e.income.flatMap((i) => [i.qty, i.price]),
  ].filter((x): x is string => typeof x === 'string' && x.startsWith('='));

describe('replaceIdent', () => {
  it('whole names only', () => {
    expect(replaceIdent('=חניכים+חניכים_למנחה*חניכים', 'חניכים', 'נערים')).toBe('=נערים+חניכים_למנחה*נערים');
    expect(replaceIdent('=אחחניכים+חניכים2', 'חניכים', 'נערים')).toBe('=אחחניכים+חניכים2');
    expect(replaceIdent('=למעלה(חניכים/47)', 'חניכים', 'נערים')).toBe('=למעלה(נערים/47)');
  });
  it('only in formulas', () => {
    expect(replaceIdent('חניכים', 'חניכים', 'נערים')).toBe('חניכים');
    expect(replaceIdent(350, 'חניכים', 'נערים')).toBe(350);
  });
  it('never inside string literals', () => {
    expect(replaceIdent('=שכר("סמינריון")*סמינריון', 'סמינריון', 'סמ')).toBe('=שכר("סמינריון")*סמ');
  });
});

describe('renameParam', () => {
  it('updates every formula in the event and partKey, not a similar name', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    e.params.push({ id: 'pz', key: 'חניכים_למנחה', value: '=חניכים/מנחים', note: '' });
    e.lines.push({ id: 'lz', cat: 'ציוד', item: 'בדיקה', qty: '=חניכים_למנחה+חניכים', days: '', price: 1, note: '' });
    const before = compute(b);
    const usesBefore = allFormulas(e).filter((f) => /(?<![\p{L}\p{N}_])חניכים(?![\p{L}\p{N}_])/u.test(f)).length;
    expect(usesBefore).toBeGreaterThan(3);

    const id = e.params.find((p) => p.key === 'חניכים')!.id;
    expect(renameParam(b, 'semb', id, 'נערים')).toEqual({ ok: true, key: 'נערים' });

    expect(e.partKey).toBe('נערים');
    expect(e.params.find((p) => p.id === 'pz')).toMatchObject({ key: 'חניכים_למנחה', value: '=נערים/מנחים' });
    expect(e.lines.find((l) => l.id === 'lz')!.qty).toBe('=חניכים_למנחה+נערים');
    expect(allFormulas(e).some((f) => /(?<![\p{L}\p{N}_])חניכים(?![\p{L}\p{N}_])/u.test(f))).toBe(false);

    const after = compute(b);
    near(after.tot.exp, before.tot.exp);
    near(after.ev['semb']!.part, 350);
    expect(after.ev['semb']!.issues.filter((i) => i.kind.endsWith('error'))).toEqual([]);
  });

  it('does not touch other events', () => {
    const b = loadSeed();
    const semgBefore = JSON.stringify(ev(b, 'semg'));
    const id = ev(b, 'semb').params.find((p) => p.key === 'חניכים')!.id;
    renameParam(b, 'semb', id, 'נערים');
    expect(JSON.stringify(ev(b, 'semg'))).toBe(semgBefore);
  });

  it('cleans the name and rejects bad or duplicate names', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    const id = e.params.find((p) => p.key === 'מנחים')!.id;
    expect(renameParam(b, 'semb', id, '  מנחים בכירים ')).toEqual({ ok: true, key: 'מנחים_בכירים' });
    expect(renameParam(b, 'semb', id, '2מנחים').ok).toBe(false);
    expect(renameParam(b, 'semb', id, 'מנחים-ב').ok).toBe(false);
    expect(renameParam(b, 'semb', id, 'חניכים')).toEqual({ ok: false, error: 'כבר יש פרמטר בשם הזה' });
    expect(e.params.find((p) => p.id === id)!.key).toBe('מנחים_בכירים');
  });
});

describe('renamePrice', () => {
  it('updates all events, not a similar key', () => {
    const b = loadSeed();
    const before = compute(b);
    const price = b.prices.find((p) => p.key === 'אוטובוס')!;
    const countOld = (re: RegExp): number => b.events.flatMap(allFormulas).filter((f) => re.test(f)).length;
    const plainBus = /(?<![\p{L}\p{N}_])אוטובוס(?![\p{L}\p{N}_])/u;
    const masaBus = /(?<![\p{L}\p{N}_])אוטובוס_מסע(?![\p{L}\p{N}_])/u;
    const masaCount = countOld(masaBus);
    expect(countOld(plainBus)).toBeGreaterThan(0);

    expect(renamePrice(b, price.id, 'אוטובוס_רגיל').ok).toBe(true);
    expect(countOld(plainBus)).toBe(0);
    expect(countOld(masaBus)).toBe(masaCount);
    near(compute(b).tot.exp, before.tot.exp);
  });
});

describe('renameCategory', () => {
  it('moves lines with the category', () => {
    const b = loadSeed();
    const before = compute(b);
    const e = ev(b, 'semb');
    const cat = e.cats.find((c) => c.name === 'ציוד')!;
    const n = e.lines.filter((l) => l.cat === 'ציוד').length;
    expect(renameCategory(b, 'semb', cat.id, 'ציוד ומתנות').ok).toBe(true);
    expect(e.lines.filter((l) => l.cat === 'ציוד ומתנות')).toHaveLength(n);
    const after = compute(b);
    near(after.ev['semb']!.cats[cat.id]!, before.ev['semb']!.cats[cat.id]!);
    near(after.tot.exp, before.tot.exp);
    expect(renameCategory(b, 'semb', cat.id, 'אש"ל')).toEqual({ ok: false, error: 'כבר יש קטגוריה בשם הזה' });
  });
});

describe('renameSalaryRow', () => {
  it('updates every שכר("...") call in all events, and nothing else', () => {
    const b = loadSeed();
    const before = compute(b);
    const row = b.salary.find((r) => r.name === 'סמינריון')!;
    const uses = countSalaryUses(b, 'סמינריון');
    expect(uses).toBeGreaterThanOrEqual(2); // סמינריון בנים + בנות
    ev(b, 'semb').params.push({ id: 'pq', key: 'סמינריון', value: '=1', note: '' }); // a param with the same name
    ev(b, 'semb').params.push({ id: 'pr', key: 'ש2', value: '=שכר( "סמינריון" )*סמינריון', note: '' });

    expect(renameSalaryRow(b, row.id, 'סמינריון קיץ')).toEqual({ ok: true, key: 'סמינריון קיץ' });
    expect(countSalaryUses(b, 'סמינריון')).toBe(0);
    expect(countSalaryUses(b, 'סמינריון קיץ')).toBe(uses + 1);
    // the param name in the formula is untouched; spacing inside the call is kept
    expect(ev(b, 'semb').params.find((p) => p.id === 'pr')!.value).toBe('=שכר( "סמינריון קיץ" )*סמינריון');
    const after = compute(b);
    near(after.tot.exp, before.tot.exp);
    expect(after.ev['semb']!.issues.filter((i) => i.kind.endsWith('error'))).toEqual([]);
  });

  it('rejects empty, quoted or duplicate names', () => {
    const b = loadSeed();
    const row = b.salary[0]!;
    expect(renameSalaryRow(b, row.id, '  ').ok).toBe(false);
    expect(renameSalaryRow(b, row.id, 'שבת "הנהגה"')).toEqual({ ok: false, error: 'השם לא יכול לכלול מירכאות' });
    expect(renameSalaryRow(b, row.id, b.salary[1]!.name)).toEqual({ ok: false, error: 'כבר יש שורה בשם הזה' });
  });

  it('replaceSalaryRef only touches שכר calls', () => {
    expect(replaceSalaryRef('=שכר("א")+"א"', 'א', 'ב')).toBe('=שכר("ב")+"א"');
    expect(replaceSalaryRef('=משכר("א")', 'א', 'ב')).toBe('=משכר("א")');
    expect(replaceSalaryRef('שכר("א")', 'א', 'ב')).toBe('שכר("א")');
  });
});

describe('countNameUses', () => {
  it('counts formula fields that use a price key', () => {
    const b = loadSeed();
    expect(countNameUses(b, 'אוטובוס_מסע')).toBeGreaterThan(0);
    expect(countNameUses(b, 'לא_קיים')).toBe(0);
  });
});
