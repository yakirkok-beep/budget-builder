/**
 * End-to-end check from CLAUDE.md section 13: load the app, change a param,
 * see the ledger total change, reload, and see that the change was saved.
 * Every test gets a fresh browser profile, so the app starts from the seed.
 */
import { expect, test } from '@playwright/test';
import { N } from './numbers';

test('a param change updates the ledger and survives a reload', async ({ page }) => {
  await page.goto('/#ev-semb');
  const ledgerExp = page.getByTestId('ledger-exp');
  await expect(ledgerExp).toHaveText(N.total);

  const kids = page.getByTestId('param-חניכים');
  await kids.fill('400');

  await expect(ledgerExp).toHaveText(N.kids400Total);
  await expect(page.getByTestId('event-exp')).toHaveText(N.kids400Exp);
  await expect(page.getByTestId('event-inc')).toHaveText(N.kids400Inc);
  await expect(kids).toBeFocused();

  // autosave: "יש שינויים" -> "נשמר" after 1.5 seconds
  await expect(page.getByTestId('save-status')).toHaveText('נשמר', { timeout: 5000 });

  await page.reload();
  await expect(page.getByTestId('param-חניכים')).toHaveValue('400');
  await expect(ledgerExp).toHaveText(N.kids400Total);
});

test('unchecking an event in the summary removes it from the totals', async ({ page }) => {
  await page.goto('/#summary');
  const ledgerExp = page.getByTestId('ledger-exp');
  await expect(ledgerExp).toHaveText(N.total);
  await page.getByRole('checkbox', { name: 'לכלול בתקציב את סמינריון בנים' }).uncheck();
  await expect(ledgerExp).toHaveText(N.withoutSemb);
  await page.getByRole('link', { name: 'סמינריון בנים' }).first().click();
  await expect(page).toHaveURL(/#ev-semb$/);
  await expect(page.getByTestId('event-name')).toHaveValue('סמינריון בנים');
});
