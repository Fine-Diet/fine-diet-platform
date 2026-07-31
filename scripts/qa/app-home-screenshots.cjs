/**
 * Local QA screenshots for Main App Home presentation review.
 * Usage:
 * APP_HOME_QA_URL=http://localhost:3000/dev/app-home node scripts/qa/app-home-screenshots.cjs
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.APP_HOME_QA_URL || 'http://localhost:3000/dev/app-home';
const OUT = path.join(process.cwd(), '.reports/app-home-presentation');

async function shot(page, name, fullPage = true) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log('wrote', file);
}

async function gotoFixture(page, fixture) {
  const url = fixture ? `${BASE}?fixture=${fixture}` : BASE;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Today\'s Rhythm', { timeout: 30000 });
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

  await gotoFixture(d, 'next_meal');
  await shot(d, '02-next-meal-welcome-rhythm-desktop');

  await gotoFixture(d, 'all_logged');
  await d.waitForSelector('text=Review Today');
  await shot(d, '03-all-logged-desktop', false);

  await gotoFixture(d, 'no_schedule');
  await d.waitForSelector('text=Set Meal Times');
  await shot(d, '04-no-schedule-desktop', false);

  await gotoFixture(d, 'default');
  await d.getByText('Nutrition Density So Far Today').scrollIntoViewIfNeeded();
  await shot(d, '05-nds-populated-desktop', false);

  await gotoFixture(d, 'nds_empty');
  await shot(d, '06-nds-empty-desktop', false);

  await gotoFixture(d, 'program_active');
  await d.waitForSelector('text=Continue Baseline');
  await shot(d, '07-program-active-desktop', false);

  await gotoFixture(d, 'program_recommendation');
  await d.waitForSelector('text=Baseline Maintenance');
  await shot(d, '08-program-recommendation-desktop', false);

  await gotoFixture(d, 'program_recommendation_pending');
  await d.waitForSelector('text=being prepared');
  await shot(d, '09-program-recommendation-pending-desktop', false);

  await gotoFixture(d, 'food_ready');
  await d.getByRole('heading', { name: /Prepare for scheduled grocery/i }).scrollIntoViewIfNeeded();
  await shot(d, '10-food-ready-desktop', false);

  await gotoFixture(d, 'food_no_plan');
  await d.waitForSelector('text=Open Plans');
  await shot(d, '11-food-no-plan-desktop', false);

  await browser.close();
  console.log('done', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
