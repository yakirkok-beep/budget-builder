/** Stage 5: several budgets, JSON backup/restore, reset, Excel export. */
import { readFile, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { expect, test, type Page } from '@playwright/test';
import { N } from './numbers';

const ledger = (page: Page) => page.getByTestId('ledger-exp');

async function setInflation(page: Page, v: string): Promise<void> {
  await page.goto('/#params');
  await page.getByTestId('global-התייקרות').fill(v);
}

test('JSON backup downloads and loads back as a new budget with the same totals', async ({ page }, info) => {
  await setInflation(page, '0.03');
  await expect(ledger(page)).toHaveText(N.infl3Total);

  await page.goto('/#data');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-json').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${N.templateName}.json`);
  const path = info.outputPath('backup.json');
  await file.saveAs(path);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  expect(saved.globals['התייקרות']).toBe(0.03);

  // change the open budget, then load the backup
  await setInflation(page, '0');
  await expect(ledger(page)).toHaveText(N.total);
  await page.goto('/#data');
  await page.getByTestId('import-file').setInputFiles(path);

  await expect(page.getByTestId('budget-select').locator('option:checked')).toHaveText(`${N.templateName} (ייבוא)`);
  await expect(ledger(page)).toHaveText(N.infl3Total);
  await expect(page).toHaveURL(/#summary$/);
  await expect(page.getByTestId('budget-select').locator('option')).toHaveCount(2);
});

test('a file that is not a backup is rejected with a message', async ({ page }, info) => {
  await page.goto('/#data');
  const path = info.outputPath('bad.json');
  await writeFile(path, JSON.stringify({ hello: 'world' }));
  await page.getByTestId('import-file').setInputFiles(path);
  await expect(page.getByRole('status').filter({ hasText: 'הקובץ לא נראה כמו גיבוי של הכלי' })).toBeVisible();
  await expect(page.getByTestId('budget-select').locator('option')).toHaveCount(1);
});

test('new budget as a copy, switch between budgets, survives reload, delete', async ({ page }) => {
  await page.goto('/#summary');
  await page.getByRole('button', { name: 'תקציב חדש' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'תקציב חדש' });
  await dialog.getByLabel('שם').fill('תרחיש חיסכון');
  await dialog.getByLabel('להתחיל מ').selectOption('copy');
  await dialog.getByRole('button', { name: 'יצירה' }).click();

  const select = page.getByTestId('budget-select');
  await expect(select.locator('option:checked')).toHaveText('תרחיש חיסכון');
  await setInflation(page, '0.03');
  await expect(ledger(page)).toHaveText(N.infl3Total);

  // back to the first budget: untouched
  await select.selectOption({ label: N.templateName });
  await expect(ledger(page)).toHaveText(N.total);

  // the last opened budget is reopened after a reload
  await select.selectOption({ label: 'תרחיש חיסכון' });
  await expect(ledger(page)).toHaveText(N.infl3Total);
  await page.reload();
  await expect(select.locator('option:checked')).toHaveText('תרחיש חיסכון');
  await expect(ledger(page)).toHaveText(N.infl3Total);

  // delete the other budget from the data screen
  await page.goto('/#data');
  await page.getByRole('button', { name: 'מחיקת התקציב ' + N.templateName }).click();
  await page.getByRole('dialog', { name: 'מחיקת תקציב' }).getByRole('button', { name: 'מחיקה' }).click();
  await expect(page.getByTestId('budget-list').locator('tbody tr')).toHaveCount(1);
  await expect(select.locator('option')).toHaveCount(1);
});

test('reset to template keeps the name and restores the numbers', async ({ page }) => {
  await setInflation(page, '0.05');
  await page.getByRole('textbox', { name: 'שם התקציב' }).fill('הטיוטה שלי');
  await page.goto('/#data');
  await page.getByRole('button', { name: 'איפוס לתבנית' }).click();
  await page.getByRole('dialog', { name: 'איפוס לתבנית' }).getByRole('button', { name: 'איפוס' }).click();
  await expect(ledger(page)).toHaveText(N.total);
  await expect(page.getByRole('textbox', { name: 'שם התקציב' })).toHaveValue('הטיוטה שלי');
});

test('Excel export downloads a real workbook with the right totals', async ({ page }, info) => {
  await page.goto('/#summary');
  const download = page.waitForEvent('download');
  await page.getByTestId('export-xlsx').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${N.templateName}.xlsx`);
  const path = info.outputPath('budget.xlsx');
  await file.saveAs(path);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  expect(wb.worksheets).toHaveLength(14);
  const ws = wb.getWorksheet('ריכוז')!;
  expect(ws.views[0]?.rightToLeft).toBe(true);
  let total: number | undefined;
  ws.eachRow((r) => {
    if (r.getCell(1).value === 'סה"כ (מפעלים פעילים)') total = r.getCell(3).value as number;
  });
  expect(total).toBeCloseTo(N.totalRaw, 2);
});
