/** Stage 4 screens: global params, price list, salary table, Priority table. */
import { expect, test } from '@playwright/test';
import { N } from './numbers';

test('global params: 3% inflation and the "בכיר" salary level (section 13 scenarios)', async ({ page }) => {
  await page.goto('/#params');
  const ledgerExp = page.getByTestId('ledger-exp');
  await expect(ledgerExp).toHaveText(N.total);

  await page.getByTestId('global-התייקרות').fill('3%');
  await expect(ledgerExp).toHaveText(N.infl3Total);
  await page.getByTestId('global-התייקרות').fill('0');
  await expect(ledgerExp).toHaveText(N.total);

  await page.getByTestId('salary-level').selectOption('בכיר');
  await expect(ledgerExp).toHaveText(N.seniorTotal);
});

test('a bad global value shows an error next to the field and a dot on the tab', async ({ page }) => {
  await page.goto('/#params');
  await page.getByTestId('global-מעביד').fill('abc');
  await expect(page.getByText('⚠ לא מספר ולא נוסחה')).toBeVisible();
  await expect(page.getByRole('link', { name: /פרמטרים ומחירון/ }).locator('.dot')).toBeVisible();
});

test('renaming a salary row updates שכר("...") in the events', async ({ page }) => {
  await page.goto('/#salary');
  const name = page.getByRole('textbox', { name: 'סוג אירוע' }).nth(7); // the 8th row in the seed
  await expect(name).toHaveValue('סמינריון');
  await name.fill('סמינריון קיץ');
  await name.press('Enter');
  await expect(name).toHaveValue('סמינריון קיץ');

  await page.goto('/#ev-semb');
  await expect(page.getByTestId('param-שכר_מנחה')).toHaveValue('=שכר("סמינריון קיץ")');
  await expect(page.getByTestId('param-result-שכר_מנחה')).toHaveText(N.seminarWage);
  await expect(page.getByTestId('ledger-exp')).toHaveText(N.total);
});

test('the Priority table adds up and copies as TSV', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#priority');
  const totalRow = page.getByTestId('priority-table').locator('tr.tot').first();
  await expect(totalRow).toContainText(N.total);
  await page.getByTestId('copy-tsv').click();
  await expect(page.getByRole('status').filter({ hasText: 'הטבלה הועתקה' })).toBeVisible();
  const tsv = await page.evaluate(() => navigator.clipboard.readText());
  const lines = tsv.split('\n');
  expect(lines[0]!.split('\t').slice(0, 5)).toEqual(['קוד', 'מפעל - קטגוריה', 'סוג', 'סכום', 'תקופה']);
  expect(lines.at(-2)!.split('\t')[3]).toBe(N.totalTsv);
});
