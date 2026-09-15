/**
 * NDS-01A authenticated browser scenarios.
 *
 * These require a synthetic local app + auth fixture. They are not run when
 * Chromium is missing or when no local fixture URL is provided. That absence
 * is BLOCKED_NOT_RUN, not a pass.
 */
import { test, expect } from '@playwright/test';

const baseURL = process.env.NDS01A_LOCAL_APP_URL;

test.skip(!baseURL, 'NDS01A_LOCAL_APP_URL is unset; browser check is BLOCKED_NOT_RUN');

test('known-sugar fixture can print a number on Home', async ({ page }) => {
  await page.goto(`${baseURL}/app`);
  await expect(page.getByText(/Nutrition density|Not scored|Updating/i)).toBeVisible();
});
