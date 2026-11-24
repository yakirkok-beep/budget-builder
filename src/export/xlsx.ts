/**
 * Excel export, stage 1 (CLAUDE.md section 11): computed values, and next to every
 * formula field its formula text in a separate column. RTL sheets:
 * ריכוז, טבלת פריוריטי, a sheet per event, פרמטרים ומחירון, שכר מנחים.
 *
 * No React and no browser APIs here; the UI turns the buffer into a download.
 * ExcelJS is passed in, so the app can load it lazily (it is large).
 */
import type ExcelJSNs from 'exceljs';
import type { Borders, Cell, Row, Workbook, Worksheet } from 'exceljs';
import { compute, minimumWage, SALARY_LEVEL_KEY } from '../domain/compute';
import { isFx } from '../domain/formula';
import { LEVELS, type Budget, type BudgetResult, type FieldResult, type Val } from '../domain/types';

type ExcelJS = typeof ExcelJSNs;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ACCENT = 'FF1D5866';
const SOFT = 'FFE1ECEE';
const INPUT = 'FFFFF7DC';
const MONEY = '#,##0';
const PERIODS = Array.from({ length: 12 }, (_, i) => i + 1);

const fxText = (v: Val): string => (isFx(v) ? String(v).trim() : '');
const num = (f: FieldResult | undefined): number | string => (f?.err ? 'שגיאה: ' + f.err : (f?.v ?? ''));
const r2 = (v: number | null | undefined): number | string => (v == null || isNaN(v) ? '' : Math.round(v * 100) / 100);

/** Excel sheet names: max 31 chars, no \ / ? * [ ] :, not blank, unique (case-insensitive). */
export function sheetNamer(): (name: string) => string {
  const used = new Set<string>();
  return (raw) => {
    const base = (String(raw).replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'גיליון').slice(0, 31);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = base.slice(0, 31 - String(i).length - 1) + ' ' + i;
    used.add(name.toLowerCase());
    return name;
  };
}

/** A safe file name from the budget name. */
export const fileNameFor = (budgetName: string, ext: string): string =>
  (budgetName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'תקציב') + '.' + ext;

function styleHeader(row: Row): void {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
}

const TOTAL_BORDER: Partial<Borders> = { top: { style: 'thin' }, bottom: { style: 'double' } };

function styleTotal(row: Row, fromCol = 1, toCol = row.cellCount): void {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.border = TOTAL_BORDER;
  }
}

function money(cells: Cell[]): void {
  for (const c of cells) c.numFmt = MONEY;
}

function section(ws: Worksheet, title: string): void {
  ws.addRow([]);
  const r = ws.addRow([title]);
  r.getCell(1).font = { bold: true, size: 13, color: { argb: ACCENT } };
}

function titleRows(ws: Worksheet, title: string, sub?: string): void {
  const t = ws.addRow([title]);
  t.getCell(1).font = { bold: true, size: 16 };
  if (sub) ws.addRow([sub]).getCell(1).font = { italic: true, color: { argb: 'FF5C6A70' } };
}

function newSheet(wb: Workbook, name: string, widths: number[], frozenRows = 0): Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [frozenRows ? { rightToLeft: true, state: 'frozen', ySplit: frozenRows } : { rightToLeft: true }],
  });
  ws.columns = widths.map((width) => ({ width }));
  return ws;
}

/* ------------------------------------------------------------------ */

function summarySheet(wb: Workbook, b: Budget, R: BudgetResult, name: string): void {
  const ws = newSheet(wb, name, [28, 8, 14, 14, 14, 11, 12, 16, 16, 14], 3);
  titleRows(ws, b.name, `שנת תקציב ${b.year} · רמת שכר מנחים: ${String(b.globals[SALARY_LEVEL_KEY] ?? '')}`);
  styleHeader(
    ws.addRow(['מפעל', 'נכלל', 'הוצאות', 'הכנסות', 'גירעון', 'משתתפים', 'עלות לנפש', 'הוצאות תכנון 2026', 'ניצול 2026 מתוקן', 'שינוי מול תכנון']),
  );
  for (const e of b.events) {
    const E = R.ev[e.id]!;
    const row = ws.addRow([
      e.name,
      e.active ? 'כן' : 'לא',
      r2(E.exp),
      r2(E.inc),
      r2(E.def),
      E.part ?? '',
      r2(E.perHead),
      E.plan26 || '',
      E.act26 || '',
      E.plan26 ? r2(E.exp - E.plan26) : 'חדש',
    ]);
    money([3, 4, 5, 7, 8, 9, 10].map((c) => row.getCell(c)));
    if (!e.active) row.font = { color: { argb: 'FF8A969A' } };
  }
  const T = R.tot;
  const tot = ws.addRow(['סה"כ (מפעלים פעילים)', '', r2(T.exp), r2(T.inc), r2(T.def), '', '', r2(T.plan26), r2(T.act26), r2(T.exp - T.plan26)]);
  money([3, 4, 5, 8, 9, 10].map((c) => tot.getCell(c)));
  styleTotal(tot, 1, 10);
  ws.addRow([]);
  const def26 = T.plan26 - T.incPlan26;
  for (const [label, v] of [
    ['גירעון תכנון 2026', def26],
    ['שינוי בגירעון מול 2026', T.def - def26],
  ] as const) {
    const r = ws.addRow([label, '', '', '', r2(v)]);
    r.getCell(5).numFmt = MONEY;
  }
}

function prioritySheet(wb: Workbook, R: BudgetResult, name: string): void {
  const ws = newSheet(wb, name, [16, 38, 6, 13, 8, ...PERIODS.map(() => 11), 11], 1);
  styleHeader(ws.addRow(['קוד', 'מפעל - קטגוריה', 'סוג', 'סכום', 'תקופה', ...PERIODS.map((p) => 'תקופה ' + p), 'ללא תקופה']));
  for (const r of R.priority.rows) {
    const row = ws.addRow([r.code, r.label, r.type, r2(r.amt), r.period, ...r.m.map((v) => (v ? r2(v) : '')), r.none ? r2(r.none) : '']);
    money([4, ...PERIODS.map((p) => p + 5), 18].map((c) => row.getCell(c)));
    if (!r.code) row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } };
  }
  for (const [label, s] of [
    ['סה"כ הוצאות', R.priority.expenses],
    ['סה"כ הכנסות', R.priority.income],
  ] as const) {
    const row = ws.addRow(['', label, '', r2(s.total), '', ...s.m.map(r2), s.none ? r2(s.none) : '']);
    money([4, ...PERIODS.map((p) => p + 5), 18].map((c) => row.getCell(c)));
    styleTotal(row, 1, 18);
  }
}

function eventSheet(wb: Workbook, b: Budget, R: BudgetResult, evId: string, name: string): void {
  const ev = b.events.find((e) => e.id === evId)!;
  const E = R.ev[evId]!;
  const ws = newSheet(wb, name, [18, 32, 12, 12, 13, 13, 24, 18, 24, 30]);
  titleRows(ws, ev.name + (ev.active ? '' : ' (לא נכלל בתקציב)'), ev.sub || undefined);

  section(ws, 'פרמטרים');
  styleHeader(ws.addRow(['שם', 'ערך', 'נוסחה', 'הערה']));
  for (const p of ev.params) ws.addRow([p.key, num(E.params[p.id]), fxText(p.value), p.note]);
  if (ev.partKey) ws.addRow([`משתתפים לחישוב עלות לנפש: ${ev.partKey}`]).getCell(1).font = { italic: true };

  section(ws, 'הכנסות' + (ev.incCode ? ` (קוד ${ev.incCode})` : ''));
  styleHeader(ws.addRow(['מקור', 'משלמים', 'מחיר', 'סה"כ', 'נוסחת משלמים', 'נוסחת מחיר', 'הערה']));
  for (const i of ev.income) {
    const I = E.income[i.id]!;
    const row = ws.addRow([i.label, num(I.q), num(I.p), I.err ? 'שגיאה' : r2(I.t), fxText(i.qty), fxText(i.price), i.note]);
    row.getCell(4).numFmt = MONEY;
  }

  section(ws, 'שורות הוצאה (סה"כ = כמות × ימים × מחיר × (1 + התייקרות))');
  styleHeader(ws.addRow(['קטגוריה', 'פריט', 'כמות', 'ימים / פעמים', 'מחיר ליחידה', 'סה"כ', 'נוסחת כמות', 'נוסחת ימים', 'נוסחת מחיר', 'הערה']));
  const valid = new Set(ev.cats.filter((c) => !c.blat).map((c) => c.name));
  for (const l of ev.lines) {
    const L = E.lines[l.id]!;
    const row = ws.addRow([
      valid.has(l.cat) ? l.cat : `${l.cat || ''} (ללא קטגוריה)`.trim(),
      l.item,
      num(L.q),
      num(L.d),
      num(L.p),
      L.err ? 'שגיאה' : r2(L.t),
      fxText(l.qty),
      fxText(l.days),
      fxText(l.price),
      l.note,
    ]);
    row.getCell(6).numFmt = MONEY;
  }

  section(ws, 'לפי סעיפי פריוריטי');
  styleHeader(ws.addRow(['קטגוריה', 'קוד', 'תקופה', '2027', 'תכנון 2026', 'ניצול 2026 מתוקן']));
  for (const c of ev.cats) {
    const row = ws.addRow([c.name + (c.blat ? ' (מחושב)' : ''), c.code, c.period, r2(E.cats[c.id]), c.plan ?? '', c.act ?? '']);
    money([4, 5, 6].map((k) => row.getCell(k)));
  }
  if (E.unassigned) {
    const row = ws.addRow(['ללא קטגוריה', '', '', r2(E.unassigned)]);
    row.getCell(4).numFmt = MONEY;
  }

  section(ws, 'סיכום');
  const lines: [string, number | null][] = [
    ['סה"כ הוצאות', E.exp],
    ['סה"כ הכנסות', E.inc],
    ['גירעון', E.def],
    ['משתתפים', E.part],
    ['עלות לנפש', E.perHead],
    ['סבסוד לנפש', E.subsidyPerHead],
    ['גירעון תכנון 2026', E.plan26 ? E.plan26 - E.incPlan26 : null],
  ];
  for (const [label, v] of lines) {
    const row = ws.addRow([label, r2(v)]);
    row.getCell(2).numFmt = MONEY;
    if (label === 'גירעון') styleTotal(row, 1, 2);
  }
  if (E.issues.length) {
    section(ws, 'לבדיקה');
    for (const i of E.issues) ws.addRow([i.msg]).getCell(1).font = { color: { argb: 'FFB02A20' } };
  }
  for (const n of ev.notes) ws.addRow([n]).getCell(1).font = { italic: true, color: { argb: 'FF9A6200' } };
}

function paramsSheet(wb: Workbook, b: Budget, R: BudgetResult, name: string): void {
  const ws = newSheet(wb, name, [20, 40, 14, 20, 40]);
  section(ws, 'פרמטרים כלליים');
  styleHeader(ws.addRow(['שם', 'ערך', 'נוסחה', 'הסבר']));
  for (const k of Object.keys(b.globals)) {
    const raw = b.globals[k]!;
    const v = k === SALARY_LEVEL_KEY ? String(raw) : R.globalErrors[k] ? 'שגיאה: ' + R.globalErrors[k] : (R.globals[k] ?? '');
    ws.addRow([k, v, fxText(raw), b.globalNotes[k] ?? '']);
  }
  section(ws, 'מחירון');
  styleHeader(ws.addRow(['שם בנוסחאות', 'תיאור', 'מחיר', 'יחידה', 'נוסחה']));
  for (const p of b.prices) {
    ws.addRow([p.key, p.label, R.priceErrors[p.id] ? 'שגיאה: ' + R.priceErrors[p.id] : (R.prices[p.key] ?? ''), p.unit, fxText(p.value)]);
  }
}

function salarySheet(wb: Workbook, b: Budget, R: BudgetResult, name: string): void {
  const level = String(b.globals[SALARY_LEVEL_KEY] ?? '');
  const ws = newSheet(wb, name, [22, 8, 13, 11, 11, 11, 11, 36], 2);
  titleRows(ws, `טבלת שכר מנחים לאירוע · הרמה שבשימוש: ${level}`);
  styleHeader(ws.addRow(['סוג אירוע', 'שעות', 'שכר מינימום', ...LEVELS.map((l) => (l === level ? `${l} (בשימוש)` : l)), 'הערות']));
  for (const r of b.salary) {
    const mw = minimumWage(r.hours, R.globals);
    const row = ws.addRow([r.name, r.hours === '' ? '' : r.hours, mw == null ? '' : r2(mw), ...LEVELS.map((l) => r.levels[l]), r.note]);
    row.getCell(3).numFmt = MONEY;
    const at = LEVELS.indexOf(level as (typeof LEVELS)[number]);
    if (at >= 0) row.getCell(4 + at).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
  }
}

/** Build the whole workbook. */
export function buildWorkbook(ExcelJSLib: ExcelJS, budget: Budget, result: BudgetResult = compute(budget)): Workbook {
  const wb = new ExcelJSLib.Workbook();
  wb.creator = 'בונה תקציב - מחלקת ההדרכה';
  wb.created = new Date();
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  const name = sheetNamer();
  summarySheet(wb, budget, result, name('ריכוז'));
  prioritySheet(wb, result, name('טבלת פריוריטי'));
  for (const e of budget.events) eventSheet(wb, budget, result, e.id, name(e.name));
  paramsSheet(wb, budget, result, name('פרמטרים ומחירון'));
  salarySheet(wb, budget, result, name('שכר מנחים'));
  return wb;
}

/** The .xlsx file contents. */
export async function exportXlsx(ExcelJSLib: ExcelJS, budget: Budget, result?: BudgetResult): Promise<ArrayBuffer> {
  const wb = buildWorkbook(ExcelJSLib, budget, result);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
