/**
 * Fixture QA for Food UI Polish Pass 1.
 * Local non-production only. Does not click save, send, complete, or delete.
 *
 * Usage: FOOD_UI_BASE_URL=http://127.0.0.1:3027 node scripts/qa/food-ui-polish-pass1/runGeometry.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.FOOD_UI_BASE_URL ?? 'http://127.0.0.1:3027';
const evidenceDir = path.join(here, 'evidence');
const haulDetail = JSON.parse(fs.readFileSync(path.join(here, 'haul-detail.json'), 'utf8'));

const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1280x720', width: 1280, height: 720 },
  { name: 'laptop-1280x600', width: 1280, height: 600 },
  { name: 'drawer-below-1023', width: 1023, height: 800 },
  { name: 'drawer-at-1024', width: 1024, height: 800 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'phone-360x740', width: 360, height: 740 },
  { name: 'reflow-320', width: 320, height: 740 },
];

function listsOverview() {
  return {
    default_list: {
      id: 'qa-list',
      plan_id: null,
      person_id: 'qa-person',
      title: 'Weekly List',
      date_range_start: null,
      date_range_end: null,
      mode: 'manual',
      status: 'active',
      export_payload_json: null,
      is_default: true,
      archived_at: null,
      created_at: '2026-10-01T12:00:00.000Z',
      updated_at: '2026-10-01T12:00:00.000Z',
    },
    named_lists: [],
    archived_lists: [],
    plan_lists: [],
    persistent_list_summaries: {},
  };
}

async function installRoutes(page, { notice }) {
  await page.route('**/api/journal/profile', (route) => {
    const profile = notice
      ? { onboarding_skipped_at: '2026-09-01T00:00:00.000Z' }
      : { onboarding_completed_at: '2026-09-01T00:00:00.000Z' };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile }) });
  });
  await page.route('**/api/journal/food/hauls/qa-haul/invitations', (route) => {
    if (route.request().method() !== 'GET') {
      route.fulfill({ status: 405, body: 'fixture QA does not mutate' });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invitations: [] }) });
  });
  await page.route('**/api/journal/food/hauls/qa-haul', (route) => {
    if (route.request().method() !== 'GET') {
      route.fulfill({ status: 405, body: 'fixture QA does not mutate' });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(haulDetail) });
  });
  await page.route('**/api/journal/food/grocery-lists', (route) => {
    if (route.request().method() !== 'GET') {
      route.fulfill({ status: 405, body: 'fixture QA does not mutate' });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listsOverview()) });
  });
}

async function rect(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      top: Math.round(box.top),
      right: Math.round(box.right),
      bottom: Math.round(box.bottom),
      left: Math.round(box.left),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  });
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {
    label: 'fixture QA',
    baseUrl,
    realDeviceKeyboard: 'NOT_RUN',
    nestedScanner: 'NOT_RUN',
    shots: [],
    checks: [],
  };

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      await installRoutes(page, { notice: false });
      await page.goto(`${baseUrl}/dev/food-home`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-top-nav]');
      const closed = {
        viewport: viewport.name,
        header: await rect(page, '[data-app-top-nav]'),
        chrome: await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-chrome-offset').trim()),
        drawer: await rect(page, 'aside[aria-label="App navigation"]'),
      };
      const recipeButton = page.getByRole('button', { name: 'Add a recipe.' });
      const beforeTop = await recipeButton.evaluate((element) => Math.round(element.getBoundingClientRect().top));
      if (viewport.name === 'desktop-1440x900' || viewport.name === 'phone-390x844') {
        const file = `food-home-recipe-closed-${viewport.name}.png`;
        await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false });
        report.shots.push(file);
      }
      await recipeButton.click();
      await page.getByRole('menuitem', { name: 'Create from scratch' }).waitFor();
      await page.waitForFunction(() => {
        const menu = document.querySelector('[aria-label="Add a recipe"]');
        const footer = document.querySelector('[data-app-footer]');
        if (!menu || !footer) return false;
        return menu.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 2;
      });
      const menu = await rect(page, '[aria-label="Add a recipe"]');
      const footer = await rect(page, '[data-app-footer]');
      const afterTop = await recipeButton.evaluate((element) => Math.round(element.getBoundingClientRect().top));
      report.checks.push({
        id: `recipe-open-${viewport.name}`,
        headerBottom: closed.header.bottom,
        chrome: closed.chrome,
        drawerLeft: closed.drawer.left,
        drawerWidth: closed.drawer.width,
        menu,
        footerTop: footer.top,
        menuAboveFooter: menu.bottom <= footer.top + 1,
        triggerTop: afterTop,
        triggerShift: afterTop - beforeTop,
        triggerStillVisible: afterTop >= closed.header.bottom - 1 && afterTop < viewport.height,
      });
      if (viewport.name === 'desktop-1440x900' || viewport.name === 'phone-390x844') {
        const file = `food-home-recipe-open-${viewport.name}.png`;
        await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false });
        report.shots.push(file);
      }
      await page.keyboard.press('Escape');
      report.checks.push({
        id: `recipe-escape-${viewport.name}`,
        closed: await page.getByRole('menuitem', { name: 'Create from scratch' }).count().then((count) => count === 0),
      });
      await context.close();
    }

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktop.newPage();
    await installRoutes(page, { notice: false });
    await page.goto(`${baseUrl}/dev/hauls-responsive?view=builder`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-shopping-summary]');
    await page.evaluate(() => {
      const nodes = [document.scrollingElement, ...document.querySelectorAll('main')];
      for (const node of nodes) {
        if (node instanceof HTMLElement) node.scrollTop = node.scrollHeight;
      }
    });
    const summaryBox = await rect(page, '[data-shopping-summary]');
    const cta = await page.getByRole('button', { name: 'Open Shopping View' }).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { top: Math.round(box.top), bottom: Math.round(box.bottom) };
    });
    const footer = await rect(page, '[data-app-footer]');
    const plus = await rect(page, '[aria-label="Manage Haul stores"]');
    const storeLabel = await page.locator('text=1 Store').first().evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        topLeft: style.borderTopLeftRadius,
        top: Math.round(box.top),
        right: Math.round(box.right),
      };
    });
    const plusStyle = await page.locator('[aria-label="Manage Haul stores"]').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        topRight: style.borderTopRightRadius,
        bottomRight: style.borderBottomRightRadius,
        bottomLeft: style.borderBottomLeftRadius,
      };
    });
    report.checks.push({
      id: 'haul-summary-scroll-end-1440',
      summary: summaryBox,
      viewportHeight: 900,
      cta,
      footerTop: footer.top,
      borderReachesViewportEnd: Math.abs(summaryBox.bottom - 900) <= 2,
      ctaAboveFooter: cta.bottom <= footer.top + 1,
      plus,
      storeLabel,
      plusStyle,
    });
    await page.screenshot({ path: path.join(evidenceDir, 'haul-summary-scroll-end-1440.png') });
    await page.screenshot({
      path: path.join(evidenceDir, 'store-plus-corner-1440.png'),
      clip: { x: Math.max(0, plus.left - 24), y: Math.max(0, plus.top - 24), width: 140, height: 90 },
    });
    report.shots.push('haul-summary-scroll-end-1440.png', 'store-plus-corner-1440.png');

    const trigger = page.locator('[aria-label="Manage Haul stores"]');
    await trigger.focus();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const overlay = page.locator('[role="presentation"]').last();
    const overlayBox = await rect(page, '[role="presentation"]');
    const header = await rect(page, '[data-app-top-nav]');
    report.checks.push({
      id: 'food-overlay-desktop-1440',
      header,
      overlay: overlayBox,
      seam: overlayBox.top - header.bottom,
      drawerStillVisible: (await rect(page, 'aside[aria-label="App navigation"]')).width,
    });
    await page.screenshot({ path: path.join(evidenceDir, 'food-overlay-desktop-1440.png') });
    report.shots.push('food-overlay-desktop-1440.png');
    await page.keyboard.press('Escape');
    report.checks.push({
      id: 'overlay-escape-desktop',
      closed: await dialog.count().then((count) => count === 0),
    });
    await desktop.close();

    const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phone = await narrow.newPage();
    await installRoutes(phone, { notice: false });
    await phone.goto(`${baseUrl}/dev/hauls-responsive?view=builder`, { waitUntil: 'networkidle' });
    await phone.waitForSelector('[aria-label="Manage Haul stores"]');
    await phone.locator('[aria-label="Manage Haul stores"]').click();
    await phone.getByRole('dialog').waitFor();
    const narrowOverlay = await rect(phone, '[role="presentation"]');
    const narrowHeader = await rect(phone, '[data-app-top-nav]');
    report.checks.push({
      id: 'food-overlay-narrow-390',
      header: narrowHeader,
      overlay: narrowOverlay,
      seam: narrowOverlay.top - narrowHeader.bottom,
      overlayLeft: narrowOverlay.left,
    });
    await phone.screenshot({ path: path.join(evidenceDir, 'food-overlay-narrow-390.png') });
    report.shots.push('food-overlay-narrow-390.png');
    await narrow.close();

    const noticeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const noticePage = await noticeContext.newPage();
    await installRoutes(noticePage, { notice: true });
    await noticePage.goto(`${baseUrl}/dev/food-home`, { waitUntil: 'networkidle' });
    await noticePage.waitForSelector('[data-app-setup-notice]');
    const noticeHeader = await rect(noticePage, '[data-app-top-nav]');
    const noticeBar = await rect(noticePage, '[data-app-setup-notice]');
    report.checks.push({
      id: 'setup-notice-present-1440',
      notice: noticeBar,
      header: noticeHeader,
      chrome: await noticePage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-chrome-offset').trim()),
      headerStartsAtNoticeBottom: Math.abs(noticeHeader.top - noticeBar.bottom) <= 1,
    });
    await noticePage.screenshot({ path: path.join(evidenceDir, 'setup-notice-present-1440.png') });
    report.shots.push('setup-notice-present-1440.png');
    await noticeContext.close();
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(evidenceDir, 'geometry.json'), `${JSON.stringify(report, null, 2)}\n`);
  const failures = report.checks.filter((check) => {
    if (check.id.startsWith('recipe-escape')) return check.closed !== true;
    if (check.id.startsWith('recipe-open')) return check.menuAboveFooter !== true || check.triggerStillVisible !== true;
    if (check.id === 'haul-summary-scroll-end-1440') return check.borderReachesViewportEnd !== true || check.ctaAboveFooter !== true || check.plusStyle.topRight === '0px';
    if (check.id.startsWith('food-overlay')) return Math.abs(check.seam) > 2;
    if (check.id === 'overlay-escape-desktop') return check.closed !== true;
    if (check.id === 'setup-notice-present-1440') return check.headerStartsAtNoticeBottom !== true;
    return false;
  });
  console.log(JSON.stringify({ shots: report.shots.length, checks: report.checks.length, failures }, null, 2));
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
