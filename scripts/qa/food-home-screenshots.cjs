/**
 * Local QA screenshot pass for Food Home presentation review.
 * Usage: FOOD_HOME_QA_URL=http://localhost:3001/dev/food-home node scripts/qa/food-home-screenshots.cjs
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.FOOD_HOME_QA_URL || 'http://localhost:3001/dev/food-home';
const OUT = path.join(process.cwd(), '.reports/food-home-presentation');

async function shot(page, name, fullPage = true) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log('wrote', file);
}

async function clickMenuLabel(page, label) {
  await page.evaluate((text) => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const match = items.find((el) => {
      const normalized = (el.textContent || '').replace(/[▶▼×]/g, '').replace(/\s+/g, ' ').trim();
      return normalized === text;
    });
    if (!match) {
      const found = items.map((el) => (el.textContent || '').trim());
      throw new Error(`menuitem not found: ${text}; have: ${JSON.stringify(found)}`);
    }
    match.click();
  }, label);
}

async function openAddNew(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
  const trigger = page.getByRole('button', { name: '+ Add New' });
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await trigger.click();
  await page.waitForSelector('[role="menu"]');
  await page.waitForTimeout(100);
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
  await d.waitForSelector('text=Maintain a kitchen aligned with your goals');
  await shot(d, '01-default-desktop');

  await d.getByRole('button', { name: /Select Chicken Breast/i }).click();
  await d.getByRole('button', { name: /Select Spinach/i }).click();
  await d.waitForSelector('text=Add 2 to Grocery List');
  await shot(d, '02-ingredient-selection-desktop');

  await d.goto(BASE, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('text=Maintain a kitchen aligned with your goals');
  await openAddNew(d);
  await clickMenuLabel(d, 'Meal');
  await d.waitForSelector('text=Build From Scratch');
  await shot(d, '03-meal-submenu-desktop', false);

  await d.keyboard.press('Escape');
  await openAddNew(d);
  await clickMenuLabel(d, 'Recipe');
  await d.waitForSelector('text=Create Manually');
  await shot(d, '04-recipe-submenu-desktop', false);

  await d.keyboard.press('Escape');
  await openAddNew(d);
  await clickMenuLabel(d, 'Meal');
  await clickMenuLabel(d, 'Start From A Recipe');
  await d.waitForSelector('text=Choose a saved recipe');
  await d.waitForTimeout(700);
  await shot(d, '05-recipe-picker-stub-desktop', false);
  await d.getByRole('button', { name: 'Close recipe picker' }).click();

  await openAddNew(d);
  await clickMenuLabel(d, 'Recipe');
  await clickMenuLabel(d, 'Upload Image or PDF');
  await d.waitForSelector('text=Add a recipe file');
  await shot(d, '06-upload-stub-desktop', false);
  await d.getByRole('button', { name: 'Close upload sheet' }).click();

  await d.goto(`${BASE}?fixture=ready_anytime_invalid`, {
    waitUntil: 'domcontentloaded',
  });
  await d.waitForSelector('text=Start date cannot be after end date');
  await d.getByRole('button', { name: 'Make List' }).scrollIntoViewIfNeeded();
  await shot(d, '07-ready-anytime-invalid-desktop', false);

  await d.goto(BASE, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('text=Make List');
  await d.getByRole('button', { name: 'Make List' }).scrollIntoViewIfNeeded();
  await d.getByRole('button', { name: 'Make List' }).click();
  await d.waitForSelector('text=Making list…');
  await shot(d, '08-ready-anytime-submitting-desktop', false);
  await d.waitForSelector('text=List ready on My Grocery List', { timeout: 5000 });

  const m = await mobile.newPage();
  await m.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await m.waitForSelector('text=Maintain a kitchen aligned with your goals');
  await shot(m, '09-default-mobile');

  await m.getByRole('button', { name: /Select Chicken Breast/i }).click();
  await m.waitForSelector('text=Add 1 to Grocery List');
  await shot(m, '10-ingredient-selection-mobile');

  await openAddNew(m);
  await clickMenuLabel(m, 'Recipe');
  await m.waitForSelector('text=Create Manually');
  await shot(m, '11-recipe-submenu-mobile', false);

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
