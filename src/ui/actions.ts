/**
 * Budget-level actions shared by the header and the data screen:
 * switching, creating, deleting, resetting, JSON backup and Excel export.
 */
import { MigrateError } from '../domain/migrate';
import { budgetStore, resultOf } from '../store';
import { navigate } from './router';
import { confirmDialog, toast } from './uiStore';

const store = () => budgetStore.getState();

const errText = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

/** Safe file name from the budget name (same rule as the Excel exporter). */
const fileName = (name: string, ext: string): string =>
  (name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'תקציב') + '.' + ext;

export function downloadFile(data: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function switchBudget(id: string): Promise<void> {
  try {
    await store().switchBudget(id);
    navigate({ view: 'summary' });
  } catch (e) {
    toast(errText(e, 'לא הצלחתי לפתוח את התקציב'));
  }
}

export async function createBudget(from: 'template' | 'copy', name: string): Promise<void> {
  try {
    await store().createBudget(from, name);
    navigate({ view: 'summary' });
    toast('נוצר תקציב חדש');
  } catch (e) {
    toast(errText(e, 'לא הצלחתי ליצור תקציב'));
  }
}

export async function deleteBudget(id: string, name: string): Promise<void> {
  const ok = await confirmDialog({
    title: 'מחיקת תקציב',
    message: `למחוק את התקציב "${name}"? אי אפשר לשחזר. כדאי לייצא גיבוי JSON לפני כן.`,
    ok: 'מחיקה',
    danger: true,
  });
  if (!ok) return;
  const wasOpen = id === store().budgetId;
  try {
    await store().deleteBudget(id);
    if (wasOpen) navigate({ view: 'summary' });
    toast('התקציב נמחק');
  } catch (e) {
    toast(errText(e, 'המחיקה נכשלה'));
  }
}

export async function resetToTemplate(): Promise<void> {
  const ok = await confirmDialog({
    title: 'איפוס לתבנית',
    message: 'לטעון את התבנית לדוגמה (מספרים לדוגמה בלבד) לתוך התקציב הפתוח? כל הנתונים הנוכחיים שלו יוחלפו. השם נשמר. אפשר לבטל עם Ctrl+Z.',
    ok: 'איפוס',
    danger: true,
  });
  if (!ok) return;
  store().resetToTemplate();
  navigate({ view: 'summary' });
  toast('התבנית לדוגמה נטענה');
}

export function exportJson(): void {
  const b = store().budget;
  if (!b) return;
  downloadFile(JSON.stringify(b, null, 1), 'application/json', fileName(b.name, 'json'));
  toast('קובץ הגיבוי ירד');
}

export async function importJsonFile(file: File): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    toast('הקובץ אינו JSON תקין');
    return;
  }
  try {
    await store().importBudget(raw);
    navigate({ view: 'summary' });
    toast('התקציב נטען כתקציב חדש');
  } catch (e) {
    toast(e instanceof MigrateError ? e.message : errText(e, 'הטעינה נכשלה'));
  }
}

let exporting = false;

export async function exportExcel(): Promise<void> {
  const b = store().budget;
  if (!b || exporting) return;
  exporting = true;
  toast('מכין קובץ Excel...');
  try {
    // ExcelJS is large: load it only when exporting.
    const [mod, xlsx] = await Promise.all([import('exceljs'), import('../export/xlsx')]);
    const ExcelJS = (mod.default ?? mod) as typeof mod.default;
    const buf = await xlsx.exportXlsx(ExcelJS, b, resultOf(b));
    downloadFile(buf, xlsx.XLSX_MIME, xlsx.fileNameFor(b.name, 'xlsx'));
    toast('קובץ ה-Excel ירד');
  } catch (e) {
    console.error(e);
    toast('הייצוא ל-Excel נכשל');
  } finally {
    exporting = false;
  }
}
