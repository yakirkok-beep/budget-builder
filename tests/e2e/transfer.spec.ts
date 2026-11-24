/**
 * Copy, paste, duplicate and move (CLAUDE.md section 17): the row menu, the clipboard bar,
 * multi-select, drag and drop with the Windows rule, name conflicts, and an event pasted into
 * another budget. The numbers to expect are computed by the domain functions (numbers.ts).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { T } from './numbers';

const items = (page: Page): Promise<string[]> =>
  page.locator('.lines-table input[aria-label="פריט"]').evaluateAll((xs) => xs.map((x) => (x as HTMLInputElement).value));

/** The row of an expense line, found by the value of its item cell. */
const lineRow = (page: Page, item: string): Locator =>
  page.locator('.lines-table tbody tr').filter({ has: page.getByRole('checkbox', { name: 'בחירת ' + item, exact: true }) });

test('row menu: copy a line, paste it in another event with the params it needs, undo', async ({ page }) => {
  await page.goto('/#ev-bereshit');
  await page.getByRole('button', { name: 'פעולות על ' + T.ashel }).click();
  await page.getByRole('menuitem', { name: 'העתקה', exact: true }).click();
  await expect(page.getByTestId('clipbar')).toContainText('שורת הוצאה משבת בראשית');

  await page.getByRole('link', { name: 'פיתוח הדרכה כללי' }).first().click();
  await expect(page.getByTestId('event-exp')).toHaveText(T.devExp);
  await page.getByTestId('clip-paste').click();

  await expect.poll(() => items(page)).toContain(T.ashel);
  await expect(page.getByTestId('param-משתתפים')).toBeVisible(); // the formula's params were added
  await expect(page.getByTestId('param-הנהלה')).toBeVisible();
  await expect(page.getByTestId('event-exp')).toHaveText(T.devPasteAshelExp);

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('event-exp')).toHaveText(T.devExp);
  await expect.poll(() => items(page)).not.toContain(T.ashel);
});

test('row menu: duplicate a line', async ({ page }) => {
  await page.goto('/#ev-dev');
  await page.getByRole('button', { name: 'פעולות על שכתוב' }).click();
  await page.getByRole('menuitem', { name: 'שכפול' }).click();
  await expect.poll(async () => (await items(page)).filter((x) => x === 'שכתוב').length).toBe(2);
  await expect(page.getByTestId('event-exp')).toHaveText(T.devDupExp);
});

// a tall window, so the dragged row and the drop target are both on screen
test.use({ viewport: { width: 1280, height: 1500 } });

test('multi-select and drag onto another category moves the lines', async ({ page }) => {
  await page.goto('/#ev-dev');
  await expect(page.getByTestId('cat-מדיה')).toHaveText(T.mediaBefore);
  await page.getByRole('checkbox', { name: 'בחירת שכתוב', exact: true }).check();
  await page.getByRole('checkbox', { name: 'בחירת שונות', exact: true }).check();
  await expect(page.getByTestId('selbar')).toContainText('2 שורות נבחרו');

  const group = page.locator('.lines-table tr.grp').filter({ hasText: 'מדיה' });
  await lineRow(page, 'שכתוב').locator('.handle').dragTo(group);

  await expect(page.getByTestId('cat-מדיה')).toHaveText(T.mediaAfterMove);
  await expect(page.getByTestId('event-exp')).toHaveText(T.devExp); // moved, not copied
  await expect(page.getByRole('combobox', { name: 'קטגוריה של שכתוב' })).toHaveValue('מדיה');
  await expect(page.getByRole('combobox', { name: 'קטגוריה של שונות' })).toHaveValue('מדיה');
});

test('drag with Ctrl inside the same event copies', async ({ page }) => {
  await page.goto('/#ev-dev');
  const group = page.locator('.lines-table tr.grp').filter({ hasText: 'מדיה' });
  await page.keyboard.down('Control');
  await lineRow(page, 'שכתוב').locator('.handle').dragTo(group);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await items(page)).filter((x) => x === 'שכתוב').length).toBe(2);
  await expect(page.getByTestId('event-exp')).toHaveText(T.devDupExp);
});

test('drag onto another event in the sidebar copies; with Shift it moves', async ({ page }) => {
  await page.goto('/#ev-dev');
  const irgun = page.locator('.sidebar .nav-event').filter({ hasText: 'חודש ארגון' });
  await lineRow(page, 'מנוי Canva').locator('.handle').dragTo(irgun);
  await expect(page.getByRole('status').filter({ hasText: 'הודבק' })).toBeVisible();
  await expect.poll(() => items(page)).toContain('מנוי Canva'); // still here: copied
  await expect(page.getByTestId('event-exp')).toHaveText(T.devExp);

  await page.getByTestId('undo').click(); // remove the copy, then move the line with Shift
  await page.keyboard.down('Shift');
  await lineRow(page, 'מנוי Canva').locator('.handle').dragTo(irgun);
  await page.keyboard.up('Shift');
  await expect.poll(() => items(page)).not.toContain('מנוי Canva');
  await expect(page.getByTestId('event-exp')).toHaveText(T.devWithoutCanvaExp);

  await irgun.click();
  await expect.poll(() => items(page)).toContain('מנוי Canva');
  await expect(page.getByTestId('event-exp')).toHaveText(T.irgunCanvaExp);
});

test('pasting a param whose name exists asks: skip or overwrite', async ({ page }) => {
  await page.goto('/#ev-bereshit');
  await page.getByRole('button', { name: 'פעולות על אחוז_בלתם' }).click();
  await page.getByRole('menuitem', { name: 'העתקה', exact: true }).click();
  await page.getByRole('link', { name: 'פיתוח הדרכה כללי' }).first().click();
  await expect(page.getByTestId('param-אחוז_בלתם')).toHaveValue('0');

  await page.getByTestId('clip-paste').click();
  const dialog = page.getByRole('dialog', { name: 'שמות שכבר קיימים' });
  await expect(dialog).toContainText('אחוז_בלתם');
  await dialog.getByRole('button', { name: 'לדלג עליהם' }).click();
  await expect(page.getByTestId('param-אחוז_בלתם')).toHaveValue('0');

  await page.getByTestId('clip-paste').click();
  await page.getByRole('dialog', { name: 'שמות שכבר קיימים' }).getByRole('button', { name: 'להחליף אותם' }).click();
  await expect(page.getByTestId('param-אחוז_בלתם')).toHaveValue('=בלתם');
});

test('price list: duplicate a price from its menu', async ({ page }) => {
  await page.goto('/#params');
  await page.getByRole('button', { name: 'פעולות על אוטובוס', exact: true }).click();
  await page.getByRole('menuitem', { name: 'שכפול' }).click();
  await expect(page.getByTestId('price-אוטובוס_2')).toBeVisible();
});

test('copy an event and paste it into another budget', async ({ page }) => {
  await page.goto('/#ev-bereshit');
  await page.getByRole('button', { name: 'העתקת מפעל' }).click();
  await expect(page.getByTestId('clipbar')).toContainText('שבת בראשית');

  await page.getByRole('button', { name: 'תקציב חדש' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'תקציב חדש' });
  await dialog.getByLabel('שם').fill('תקציב בדיקה');
  await dialog.getByRole('button', { name: 'יצירה' }).click();
  await expect(page.getByTestId('budget-select').locator('option:checked')).toHaveText('תקציב בדיקה');

  await page.locator('.sidebar').getByRole('button', { name: 'הדבקת "שבת בראשית"' }).click();
  await expect(page.getByTestId('event-name')).toHaveValue('שבת בראשית (עותק)');
  await expect(page.getByTestId('event-exp')).toHaveText(T.bereshitExp);
});
