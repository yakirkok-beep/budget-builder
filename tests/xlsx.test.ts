import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportXlsx, fileNameFor, sheetNamer } from '../src/export/xlsx';
import { catAmount, ev, evExp, evInc, expected, loadSeed, near, TOTAL_EXP, TOTAL_INC } from './helpers';

const SEED = loadSeed();
const SEMINAR_WAGE = SEED.salary.find((r) => r.name === 'סמינריון')!.levels['מתחיל'];
const BUS = SEED.prices.find((p) => p.key === 'אוטובוס')!.value;

async function roundTrip(b = loadSeed()): Promise<ExcelJS.Workbook> {
  const buf = await exportXlsx(ExcelJS, b);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

/** First row whose first (or given) cell equals text. */
function rowWith(ws: ExcelJS.Worksheet, text: string, col = 1): ExcelJS.Row {
  let found: ExcelJS.Row | undefined;
  ws.eachRow((r) => {
    if (!found && r.getCell(col).value === text) found = r;
  });
  if (!found) throw new Error(`no row "${text}" in ${ws.name}`);
  return found;
}

const n = (c: ExcelJS.Cell): number => c.value as number;

describe('Excel export (stage 1)', () => {
  it('has all sheets, in order, right-to-left', async () => {
    const b = loadSeed();
    const wb = await roundTrip(b);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(['ריכוז', 'טבלת פריוריטי', ...b.events.map((e) => e.name), 'פרמטרים ומחירון', 'שכר מנחים']);
    for (const ws of wb.worksheets) expect(ws.views[0]?.rightToLeft).toBe(true);
  });

  it('summary totals match the app', async () => {
    const ws = (await roundTrip()).getWorksheet('ריכוז')!;
    const tot = rowWith(ws, 'סה"כ (מפעלים פעילים)');
    near(n(tot.getCell(3)), TOTAL_EXP);
    near(n(tot.getCell(4)), TOTAL_INC);
    near(n(tot.getCell(5)), expected.totals.deficit);
    expect(tot.getCell(3).numFmt).toBe('#,##0');
    expect(tot.getCell(3).font?.bold).toBe(true);
    expect(tot.getCell(3).border?.bottom?.style).toBe('double');
    const semb = rowWith(ws, 'סמינריון בנים');
    near(n(semb.getCell(3)), evExp('semb'));
    expect(semb.getCell(2).value).toBe('כן');
  });

  it('event sheet: values with the formula text next to them', async () => {
    const ws = (await roundTrip()).getWorksheet('סמינריון בנים')!;
    const kids = rowWith(ws, 'חניכים');
    expect(kids.getCell(2).value).toBe(350);
    expect(kids.getCell(3).value).toBe('');
    const buses = rowWith(ws, 'אוטובוסים');
    expect(buses.getCell(2).value).toBe(8);
    expect(buses.getCell(3).value).toBe('=למעלה(חניכים/נוסעים_באוטובוס)');
    const wage = rowWith(ws, 'שכר_מנחה');
    expect(wage.getCell(2).value).toBe(SEMINAR_WAGE);
    expect(wage.getCell(3).value).toBe('=שכר("סמינריון")');
    // an expense line: qty from a formula, total, formula columns
    let line: ExcelJS.Row | undefined;
    ws.eachRow((r) => {
      if (!line && r.getCell(7).value === '=חניכים' && r.getCell(1).value === 'אש"ל') line = r;
    });
    expect(line).toBeDefined();
    expect(line!.getCell(3).value).toBe(350);
    expect(typeof line!.getCell(6).value).toBe('number');
    near(n(rowWith(ws, 'סה"כ הוצאות').getCell(2)), evExp('semb'));
    near(n(rowWith(ws, 'גירעון').getCell(2)), evExp('semb') - evInc('semb'));
    expect(rowWith(ws, 'בלת"ם (מחושב)').getCell(4).value).toBe(catAmount('semb', 'בלת"ם'));
  });

  it('priority sheet totals and header style', async () => {
    const ws = (await roundTrip()).getWorksheet('טבלת פריוריטי')!;
    expect(ws.getRow(1).getCell(1).value).toBe('קוד');
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect((ws.getRow(1).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF1D5866');
    near(n(rowWith(ws, 'סה"כ הוצאות', 2).getCell(4)), TOTAL_EXP);
    near(n(rowWith(ws, 'סה"כ הכנסות', 2).getCell(4)), TOTAL_INC);
  });

  it('params, prices and salary sheets', async () => {
    const wb = await roundTrip();
    const p = wb.getWorksheet('פרמטרים ומחירון')!;
    expect(rowWith(p, 'מעביד').getCell(2).value).toBe(1.23);
    expect(rowWith(p, 'רמת_שכר').getCell(2).value).toBe('מתחיל');
    expect(rowWith(p, 'אוטובוס').getCell(3).value).toBe(BUS);
    const s = wb.getWorksheet('שכר מנחים')!;
    expect(s.getRow(2).getCell(4).value).toBe('מתחיל (בשימוש)');
    const sem = rowWith(s, 'סמינריון');
    expect(sem.getCell(4).value).toBe(SEMINAR_WAGE);
    near(n(sem.getCell(3)), 84 * 35.4);
  });

  it('errors and inactive events are exported, not hidden', async () => {
    const b = loadSeed();
    ev(b, 'semb').lines[0]!.qty = '=לא_קיים';
    ev(b, 'semg').active = false;
    const wb = await roundTrip(b);
    const sum = wb.getWorksheet('ריכוז')!;
    expect(rowWith(sum, 'סמינריון בנות').getCell(2).value).toBe('לא');
    const semb = wb.getWorksheet('סמינריון בנים')!;
    let bad: ExcelJS.Row | undefined;
    semb.eachRow((r) => {
      if (!bad && r.getCell(7).value === '=לא_קיים') bad = r;
    });
    expect(bad!.getCell(3).value).toBe('שגיאה: שם לא מוכר: לא_קיים');
    expect(bad!.getCell(6).value).toBe('שגיאה');
    expect(wb.getWorksheet('סמינריון בנות')!.getRow(1).getCell(1).value).toBe('סמינריון בנות (לא נכלל בתקציב)');
  });
});

describe('names', () => {
  it('sheet names are valid and unique', () => {
    const name = sheetNamer();
    expect(name('ריכוז')).toBe('ריכוז');
    expect(name('ריכוז')).toBe('ריכוז 2');
    expect(name('a/b:c*d?[e]')).toBe('a b c d  e');
    expect(name('')).toBe('גיליון');
    const long = name('א'.repeat(40));
    expect(long).toHaveLength(31);
    const long2 = name('א'.repeat(40));
    expect(long2).toHaveLength(31);
    expect(long2).not.toBe(long);
  });
  it('file names', () => {
    expect(fileNameFor('תקציב 2027: טיוטה/2', 'xlsx')).toBe('תקציב 2027 טיוטה 2.xlsx');
    expect(fileNameFor('  ', 'json')).toBe('תקציב.json');
  });
});
