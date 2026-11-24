/** Stage 6 editing aids: undo/redo and formula autocomplete. */
import { expect, test } from '@playwright/test';
import { N } from './numbers';

test('Ctrl+Z / Ctrl+Y undo and redo a whole field edit, and the buttons follow', async ({ page }) => {
  await page.goto('/#ev-semb');
  const ledger = page.getByTestId('ledger-exp');
  const kids = page.getByTestId('param-חניכים');
  await expect(page.getByTestId('undo')).toBeDisabled();

  await kids.click();
  await kids.press('Control+A');
  await page.keyboard.type('400'); // three keystrokes, one undo step
  await expect(ledger).toHaveText(N.kids400Total);
  await expect(page.getByTestId('undo')).toBeEnabled();

  await page.keyboard.press('Control+KeyZ');
  await expect(ledger).toHaveText(N.total);
  await expect(kids).toHaveValue('350');
  await expect(kids).toBeFocused();
  await expect(page.getByTestId('redo')).toBeEnabled();

  await page.keyboard.press('Control+KeyY');
  await expect(ledger).toHaveText(N.kids400Total);
  await expect(kids).toHaveValue('400');

  await page.getByTestId('undo').click();
  await expect(ledger).toHaveText(N.total);
  await page.getByTestId('redo').click();
  await expect(ledger).toHaveText(N.kids400Total);
});

test('undo brings back a deleted event', async ({ page }) => {
  await page.goto('/#ev-masa');
  await page.getByRole('button', { name: 'מחיקת מפעל' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'מחיקה' }).click();
  await expect(page.getByTestId('ledger-exp')).toHaveText(N.withoutMasa);
  await page.keyboard.press('Control+KeyZ');
  await expect(page.getByTestId('ledger-exp')).toHaveText(N.total);
  await expect(page.getByRole('link', { name: 'מסע גרעין' }).first()).toBeVisible();
});

test('autocomplete suggests names while typing a formula', async ({ page }) => {
  await page.goto('/#ev-semb');
  const qty = page.getByRole('combobox', { name: 'כמות תוספת ארוחת צהריים' });
  await qty.click();
  await qty.press('Control+A');
  await page.keyboard.type('=חני');

  const list = page.getByRole('listbox', { name: 'שמות זמינים' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('option').first()).toContainText('חניכים');
  await expect(qty).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(qty).toHaveValue('=חניכים');
  await expect(qty).toBeFocused();

  // continue typing; pick a function with the mouse
  await page.keyboard.type('*למע');
  await list.getByRole('option', { name: /למעלה/ }).click();
  await expect(qty).toHaveValue('=חניכים*למעלה(');
  await page.keyboard.type('1.2)');
  await expect(qty).toHaveValue('=חניכים*למעלה(1.2)');
  await page.keyboard.press('Enter');
  await expect(qty.locator('xpath=following-sibling::span[1]')).toHaveText('= 700');

  // Escape closes the list without changing the text
  await qty.click();
  await page.keyboard.press('End');
  await page.keyboard.type('+מנ');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(qty).toHaveValue('=חניכים*למעלה(1.2)+מנ');
});
