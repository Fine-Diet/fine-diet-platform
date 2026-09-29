/** Fixture-backed B2 invite/collaboration responsive QA; no backend writes. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = process.env.HAUL_QA_URL || 'http://localhost:3010/dev/hauls-responsive';
const inviteLandingBase =
  process.env.HAUL_INVITE_LANDING_URL || 'http://localhost:3000/haul-invitations';
const invitationId = '5b0a6d0e-2f0b-4d6e-9d3e-0c1f6f1d7a11';
const out = path.join(process.cwd(), '.reports/haul-invite-b2-responsive');
const widths = process.env.HAUL_QA_WIDTHS
  ? process.env.HAUL_QA_WIDTHS.split(',').map(Number)
  : [1440, 1024, 900, 430, 390];

function fakeAccessToken() {
  const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: 'auth-invitee',
    aud: 'authenticated',
    role: 'authenticated',
    exp,
    email: 'guest@example.com',
  })}.sig`;
}

const lists = ['Essentials', 'Jordan’s List', 'Weekly Breakfast'].map((title, i) => ({
  id: `list-${i}`,
  title,
  status: 'active',
  is_default: i === 0,
  updated_at: '2026-09-28',
  archived_at: null,
}));

const stores = [
  {
    id: 'store-1',
    retailer: 'Whole Foods Market',
    store_location: 'Peoria',
    source: 'manual',
    postal_code: '74105',
  },
];

const snapshotItems = [0, 1].map((i) => ({
  id: `item-snap-${i}`,
  haul_id: 'qa-haul',
  source_grocery_list_id: 'list-0',
  grocery_item_id: `grocery-${i}`,
  name_snapshot: 'Blueberries',
  quantity_snapshot: 1,
  unit_snapshot: 'package',
  final_quantity: 1,
  origin_type: 'source_list_snapshot',
  added_by_person_id: null,
  product_title: 'Organic Blueberries',
  brand_name: null,
  retailer: 'Whole Foods Market',
  store_location: 'Peoria',
  haul_store_id: 'store-1',
  price_amount: 5.99,
  price_currency: 'USD',
  price_source: 'manual',
  purchase_unit: 'package',
  package_size: null,
  package_count: null,
  package_unit: null,
}));

const contributorItems = [
  {
    id: 'item-contrib-1',
    haul_id: 'qa-haul',
    source_grocery_list_id: null,
    grocery_item_id: null,
    name_snapshot: 'Sparkling water',
    quantity_snapshot: 2,
    unit_snapshot: 'L',
    final_quantity: 2,
    origin_type: 'haul_contributor',
    added_by_person_id: 'person-contrib',
    product_title: null,
    brand_name: null,
    retailer: null,
    store_location: null,
    haul_store_id: null,
    price_amount: null,
    price_currency: 'USD',
    price_source: null,
    purchase_unit: null,
    package_size: null,
    package_count: null,
    package_unit: null,
  },
];

const detail = {
  haul: {
    id: 'qa-haul',
    status: 'planned',
    title: 'Weekly groceries',
    shopping_date: '2026-09-28',
    currency: 'USD',
    budget_amount: 150,
  },
  source_lists: lists.slice(0, 2).map((l) => ({ grocery_list_id: l.id, title: l.title })),
  stores,
  items: [...snapshotItems, ...contributorItems],
  estimate: {
    currency: 'USD',
    estimated_total: 11.98,
    execution_item_count: 3,
    priced_item_count: 2,
    unpriced_item_count: 1,
    missing_product_count: 0,
    missing_store_count: 0,
    by_store: [
      {
        store_key: JSON.stringify(['whole foods market', 'peoria', '']),
        retailer: 'Whole Foods Market',
        store_location: 'Peoria',
        estimated_subtotal: 11.98,
      },
    ],
  },
};

const overview = {
  default_list: lists[0],
  named_lists: lists.slice(1),
  persistent_list_summaries: Object.fromEntries(
    lists.map((l) => [l.id, { counts: { pending: 3 } }]),
  ),
};

const invitations = [
  {
    id: 'inv-pending',
    haul_id: 'qa-haul',
    invited_email: 'guest@example.com',
    invited_person_id: null,
    invited_display_name: null,
    role: 'contributor',
    status: 'pending',
    invited_at: '2026-09-28T12:00:00Z',
    accepted_at: null,
    revoked_at: null,
  },
  {
    id: 'inv-accepted',
    haul_id: 'qa-haul',
    invited_email: 'alice@example.com',
    invited_person_id: 'person-alice',
    invited_display_name: 'Alice A',
    role: 'contributor',
    status: 'accepted',
    invited_at: '2026-09-27T12:00:00Z',
    accepted_at: '2026-09-27T13:00:00Z',
    revoked_at: null,
  },
];

function sharedContributorPayload() {
  return {
    detail: {
      ...detail,
      items: [...snapshotItems, ...contributorItems],
    },
    viewer: { role: 'contributor', person_id: 'person-contrib' },
    contributors: [{ person_id: 'person-contrib', display_name: 'Casey C' }],
  };
}

async function inspect(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  const findings = await page.evaluate(() => {
    const root =
      document.querySelector('[role="dialog"]') ||
      document.querySelector('main main') ||
      document.body;
    const overflow = [...root.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 &&
          s.visibility !== 'hidden' &&
          !el.closest('[aria-hidden="true"]') &&
          (r.right > innerWidth + 1 || r.left < -1) &&
          s.position !== 'fixed'
        );
      })
      .map((el) => ({
        tag: el.tagName,
        text: el.textContent.slice(0, 70),
        class: el.className,
      }));
    return { pageOverflow: document.documentElement.scrollWidth > innerWidth, overflow };
  });
  return { name, width, ...findings };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.HAUL_QA_BROWSER || 'chrome',
  });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    navigator.clipboard.writeText = async () => {};
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let viewerMode = 'owner';
  const landingAccessToken = fakeAccessToken();

  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const user = {
      id: 'auth-invitee',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'guest@example.com',
      email_confirmed_at: '2026-09-28T00:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-28T00:00:00.000Z',
    };
    if (url.includes('/token') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: landingAccessToken,
          refresh_token: 'rt-1',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        }),
      });
      return;
    }
    if (url.includes('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const method = route.request().method();
    let status = 200;
    let body = {};

    if (p.endsWith('/grocery-lists') && method === 'GET') body = overview;
    else if (p.endsWith('/qa-haul') && method === 'GET') {
      if (viewerMode === 'contributor') {
        status = 404;
        body = { error: 'Grocery haul not found.' };
      } else {
        body = detail;
      }
    } else if (p.endsWith('/qa-haul/shared') && method === 'GET') {
      body = sharedContributorPayload();
    } else if (p.endsWith('/qa-haul/invitations') && method === 'GET') {
      body = { invitations };
    } else if (p.endsWith('/qa-haul/invitations') && method === 'POST') {
      const payload = route.request().postDataJSON() || {};
      const deliver = payload.deliver !== false;
      body = {
        result: {
          invitation_id: deliver
            ? 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            : 'b2c3d4e5-f6a7-4890-b123-456789abcdef',
          haul_id: 'qa-haul',
          status: 'pending',
          invited_email: String(payload.email ?? 'new@example.com'),
          invited_account_linked: false,
          outcome: 'created',
          email: deliver ? 'sent' : 'skipped_not_created',
          delivery: deliver ? 'supabase_auth_invite' : 'none',
        },
      };
    } else if (p.includes('/invitations/') && method === 'POST') {
      body = { result: { invitation_id: 'inv-pending', email: 'sent', delivery: 'transactional_email' } };
    } else if (p.includes('/contributor-items') && method === 'POST') {
      const payload = route.request().postDataJSON() || {};
      const newItem = {
        ...contributorItems[0],
        id: `item-contrib-${contributorItems.length + 1}`,
        name_snapshot: payload.name || 'New item',
        quantity_snapshot: payload.quantity ?? 1,
        unit_snapshot: payload.unit ?? null,
        final_quantity: payload.quantity ?? 1,
      };
      contributorItems.push(newItem);
      detail.items = [...snapshotItems, ...contributorItems];
      body = { item: newItem };
    } else if (p.includes('/contributor-items/') && method === 'PATCH') {
      body = { item: contributorItems[0] };
    } else if (/\/haul-invitations\/[^/]+\/accept$/.test(p) && method === 'POST') {
      body = { result: { haul_id: 'qa-haul', outcome: 'accepted' } };
    } else if (p.endsWith('/link-person') && method === 'POST') {
      body = { ok: true };
    } else if (p.endsWith('/purchasing-choices')) body = { by_item_id: {} };
    else if (p.endsWith('/haul-summary')) body = { list_prices_by_item_id: {} };

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  const results = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });

    viewerMode = 'owner';
    await page.goto(`${base}?view=builder`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Prepare your next shopping trip' }).waitFor();
    results.push(await inspect(page, 'owner-builder', width));

    await page.getByRole('button', { name: '+ Invite to haul', exact: true }).click();
    await page.getByRole('heading', { name: 'Invite to haul' }).waitFor();
    await page.getByText('Pending').waitFor();
    await page.getByText('Accepted').waitFor();
    results.push(await inspect(page, 'owner-invite-dialog', width));
    if (width === 1440 || width === 430 || width === 390) {
      await page.locator('input[type="email"]').fill('copy-only@example.com');
      await page.getByRole('button', { name: 'Copy invite link', exact: true }).click();
      await page.getByText(/Invitation link copied|Copied the existing pending invitation link/).waitFor();
      results.push(await inspect(page, 'owner-invite-copy-link', width));
    }
    await page.keyboard.press('Escape');

    viewerMode = 'contributor';
    await page.goto(`${base}?view=builder`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Prepare your next shopping trip' }).waitFor();
    await page.getByRole('heading', { name: 'Added to Haul' }).waitFor();
    results.push(await inspect(page, 'contributor-shared-haul', width));

    const exposed = [];
    if (await page.getByRole('button', { name: '+ Invite to haul', exact: true }).count()) {
      exposed.push('+ Invite to haul');
    }
    if (await page.getByRole('button', { name: /^Add lists / }).count()) {
      exposed.push('Add lists');
    }
    if (await page.getByRole('button', { name: 'Manage Haul stores', exact: true }).count()) {
      exposed.push('Manage Haul stores');
    }
    if (await page.getByRole('button', { name: 'Open Shopping View', exact: true }).count()) {
      exposed.push('Open Shopping View');
    }
    if (exposed.length) {
      errors.push(`contributor@${width}: owner-only controls visible: ${exposed.join(', ')}`);
    }

    await page.getByLabel('Haul-only items').getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByRole('heading', { name: 'Add Haul item' }).waitFor();
    results.push(await inspect(page, 'contributor-add-item-dialog', width));
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Edit Haul item' }).waitFor();
    results.push(await inspect(page, 'contributor-edit-item-dialog', width));
    await page.keyboard.press('Escape');
  }

  const inviteHash =
    `#access_token=${encodeURIComponent(landingAccessToken)}&refresh_token=rt-1&expires_in=3600&token_type=bearer&type=invite`;
  await page.goto(`${inviteLandingBase}/${invitationId}${inviteHash}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /You.?re in/ }).waitFor({ timeout: 15000 });
  for (const width of [1440, 430]) {
    await page.setViewportSize({ width, height: 900 });
    results.push(await inspect(page, 'invite-landing-accepted', width));
  }

  if (process.env.HAUL_QA_RUNTIME === '1') {
    const assert = require('assert/strict');
    viewerMode = 'owner';
    await page.goto(`${base}?view=builder`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '+ Invite to haul', exact: true }).click();
    await page.getByLabel('Email').fill('new@example.com');
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
    await page.getByText('Members').waitFor();
    assert.ok(await page.getByText('Pending').isVisible());
    assert.ok(await page.getByText('Accepted').isVisible());

    viewerMode = 'contributor';
    await page.goto(`${base}?view=builder`, { waitUntil: 'networkidle' });
    await page.getByLabel('Haul-only items').getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByLabel('Name').fill('Granola');
    await page.getByLabel('Add Haul item').getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByText('Granola').waitFor();
    console.log('PASS owner invite dialog + contributor add-item flow (fixture APIs)');
  }

  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  const failures = results.filter((r) => r.pageOverflow || r.overflow.length);
  console.log(
    JSON.stringify({ screens: results.length, failures: failures.length, errors }, null, 2),
  );
  await browser.close();
  if (errors.length || failures.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
