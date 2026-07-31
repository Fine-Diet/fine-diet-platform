/**
 * Local QA screenshots for Programs Home presentation review.
 * Usage:
 * PROGRAMS_HOME_QA_URL=http://localhost:3000/dev/programs-home node scripts/qa/programs-home-screenshots.cjs
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE =
  process.env.PROGRAMS_HOME_QA_URL || 'http://localhost:3000/dev/programs-home';
const OUT = path.join(process.cwd(), '.reports/programs-home-presentation');

async function shot(page, name, fullPage = true) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log('wrote', file);
}

async function gotoFixture(page, fixture) {
  const url = fixture ? `${BASE}?fixture=${fixture}` : BASE;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Featured Programs', { timeout: 30000 });
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
  const m = await mobile.newPage();

  await gotoFixture(d, 'default');
  await shot(d, '01-default-desktop');
  await gotoFixture(m, 'default');
  await shot(m, '01-default-mobile');

  await gotoFixture(d, 'no_entitlement');
  await shot(d, '02-no-entitlement-hero-desktop', false);

  await gotoFixture(d, 'start_ready');
  await d.waitForSelector('text=Choose Start Date');
  await shot(d, '03-start-ready-flow-desktop', false);

  await gotoFixture(d, 'active');
  await d.waitForSelector('text=Continue Baseline');
  await shot(d, '04-active-hero-desktop', false);

  await gotoFixture(d, 'completed_recommendation');
  await d.waitForSelector('text=Your Recommendation');
  await shot(d, '05-completed-recommendation-desktop', false);

  await gotoFixture(d, 'recommendation_pending');
  await d.waitForSelector('text=being prepared');
  await shot(d, '06-recommendation-pending-desktop', false);

  await gotoFixture(d, 'multi_slide');
  await d.getByRole('button', { name: 'Previous slide' }).waitFor({ timeout: 15000 });
  await shot(d, '07-multi-slide-controls-desktop', false);

  await gotoFixture(d, 'default');
  await d.getByRole('heading', { name: 'Featured Programs' }).scrollIntoViewIfNeeded();
  await shot(d, '08-featured-desktop', false);

  await gotoFixture(m, 'default');
  await m.getByRole('heading', { name: 'Featured Programs' }).scrollIntoViewIfNeeded();
  await shot(m, '08-featured-mobile', false);

  await gotoFixture(d, 'default');
  await d.getByRole('button', { name: 'Nutrition' }).scrollIntoViewIfNeeded();
  await shot(d, '09-nutrition-category-desktop', false);

  await gotoFixture(d, 'category_lifestyle');
  await d.waitForSelector('text=Lifestyle is coming soon');
  await shot(d, '10-lifestyle-empty-desktop', false);

  await gotoFixture(d, 'category_advanced');
  await d.waitForSelector('text=Advanced is coming soon');
  await shot(d, '11-advanced-empty-desktop', false);

  await gotoFixture(d, 'search_results');
  await d.waitForSelector('text=Sport Fuel');
  await shot(d, '12-search-results-desktop', false);

  await gotoFixture(d, 'search_empty');
  await d.waitForSelector('text=No matching programs');
  await shot(d, '13-search-empty-desktop', false);

  await gotoFixture(d, 'default');
  await d.getByRole('button', { name: 'Activate' }).first().click();
  await d.getByRole('dialog').waitFor({ timeout: 15000 });
  await shot(d, '14-programme-preview-sheet-desktop', false);

  await browser.close();
  console.log('done', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
