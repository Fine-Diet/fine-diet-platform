/**
 * Local QA screenshots for Plans Home presentation review.
 * Usage: FOOD_HOME is unrelated — use:
 * FOOD_PLANS_QA_URL=http://localhost:3001/dev/plans-home node scripts/qa/plans-home-screenshots.cjs
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.FOOD_PLANS_QA_URL || 'http://localhost:3001/dev/plans-home';
const OUT = path.join(process.cwd(), '.reports/plans-home-presentation');

async function shot(page, name, fullPage = true) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log('wrote', file);
}

async function clickMenuLabel(page, label) {
  await page.evaluate((text) => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const match = items.find((el) => (el.textContent || '').replace(/\s+/g, ' ').trim() === text);
    if (!match) throw new Error(`menuitem not found: ${text}`);
    match.click();
  }, label);
}

async function openRowMenu(page, rowLabel) {
  const row = page.locator('li').filter({ hasText: rowLabel }).first();
  await row.scrollIntoViewIfNeeded();
  await row.getByRole('button', { name: /Plan|Update|Logged|Skipped|Saving/ }).click();
  await page.waitForSelector('[role="menu"]');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const d = await desktop.newPage();
  await d.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await d.waitForSelector('text=Plan for consistency');
  await shot(d, '01-default-desktop');

  await openRowMenu(d, 'Lunch');
  await d.waitForSelector('text=No meal planned');
  await shot(d, '02-empty-slot-menu-desktop', false);
  await d.keyboard.press('Escape');

  await openRowMenu(d, 'Mini-Meal');
  await shot(d, '03-pending-meal-menu-desktop', false);
  await d.keyboard.press('Escape');

  await openRowMenu(d, 'Breakfast');
  await shot(d, '04-logged-meal-menu-desktop', false);
  await d.keyboard.press('Escape');

  await d.goto(`${BASE}?fixture=logged`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('text=Stub lunch');
  await shot(d, '05-logged-rows-desktop');

  await d.goto(`${BASE}?fixture=skipped`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('text=Skipped');
  await shot(d, '06-skipped-row-desktop');

  await d.goto(BASE, { waitUntil: 'domcontentloaded' });
  await d.getByRole('heading', { name: 'Pantry Readiness' }).scrollIntoViewIfNeeded();
  await shot(d, '07-pantry-populated-desktop', false);

  await d.goto(`${BASE}?fixture=pantry_error`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('text=Could not load Pantry readiness');
  await d.getByRole('heading', { name: 'Pantry Readiness' }).scrollIntoViewIfNeeded();
  await shot(d, '08-pantry-error-desktop', false);

  await d.goto(`${BASE}?fixture=no_active_plan`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('text=No active plan yet');
  await shot(d, '09-no-active-plan-desktop');

  const m = await mobile.newPage();
  await m.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await m.waitForSelector('text=Plan for consistency');
  await shot(m, '10-default-mobile');

  await m.getByRole('heading', { name: 'Pantry Readiness' }).scrollIntoViewIfNeeded();
  await shot(m, '11-pantry-mobile', false);

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
