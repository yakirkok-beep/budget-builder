/**
 * PWA: on the production build, after one visit the app works with no network,
 * including the Excel export (its library is precached too).
 */
import { expect, test } from '@playwright/test';
import { N } from './numbers';

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByTestId('ledger-exp')).toHaveText(N.total);

  // wait until the service worker has installed and controls the page
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // a change made online is still there offline (IndexedDB)
  await page.goto('./#params');
  await page.getByTestId('global-התייקרות').fill('0.03');
  await expect(page.getByTestId('save-status')).toHaveText('נשמר', { timeout: 5000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('ledger-exp')).toHaveText(N.infl3Total);
  await page.goto('./#ev-semb');
  await expect(page.getByTestId('event-exp')).toHaveText(N.infl3Semb);

  // Excel export offline
  const download = page.waitForEvent('download');
  await page.getByTestId('export-xlsx').click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
});

test('has an installable manifest', async ({ page }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await page.evaluate(async (h) => (await fetch(h!)).json(), href);
  expect(manifest).toMatchObject({ lang: 'he', dir: 'rtl', display: 'standalone', short_name: 'תקציב הדרכה' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});
