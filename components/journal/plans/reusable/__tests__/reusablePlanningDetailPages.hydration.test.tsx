/**
 * Regression test for a real-browser-only crash: Day Template and Week
 * Pattern detail pages import TemplateDayEditor -> TemplateMealComposerPanel
 * -> lib/meals/composer/submission.ts. That file used to statically import
 * `buildGroupedMealIntakePayload` from groupedMealLoggingService.ts, which
 * ALSO imports journalServerService.ts -> supabaseServerClient.ts. The latter
 * throws at module-evaluation time whenever `typeof window !== 'undefined'`.
 *
 * That guard is a no-op under Node/Jest's default `node` test environment
 * (no `window` global) and under `renderToStaticMarkup` SSR — both silently
 * "pass" — but a REAL browser always has `window`, so the moment the page's
 * JS chunk executed client-side it threw immediately, blanking the page
 * right after "Create Blank Template" / "Create Blank Pattern" navigation.
 *
 * This test uses the jsdom environment (which defines `window`, like a real
 * browser) and actually mounts + hydrates the pages with react-dom/client,
 * so it fails the same way a real browser would if that boundary is ever
 * reintroduced. See lib/meals/groupedMealPayload.ts for the client-safe split.
 *
 * NOTE: deliberately kept OUTSIDE pages/ — Next.js treats every file under
 * pages/ as a route and tries to "collect page data" for it at build time,
 * which fails for a page-less test module. Import the real pages by path
 * from here instead.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

jest.mock('next/router', () => ({
  useRouter: () => ({
    query: { patternId: 'pattern-1', templateId: 'template-1' },
    push: jest.fn(),
    pathname: '/journal/plans/week-patterns/[patternId]',
  }),
}));

function blankSlots(offset: number) {
  return [
    { source_plan_slot_id: `slot-${offset}-1`, slot_ordinal: 1, slot_block: 'morning', slot_label: 'Breakfast', target_time: '10:00', meals: [] },
    { source_plan_slot_id: `slot-${offset}-2`, slot_ordinal: 2, slot_block: 'midday', slot_label: 'Lunch', target_time: '11:30', meals: [] },
    { source_plan_slot_id: `slot-${offset}-3`, slot_ordinal: 3, slot_block: 'midday', slot_label: 'Afternoon snack', target_time: '14:00', meals: [] },
    { source_plan_slot_id: `slot-${offset}-4`, slot_ordinal: 4, slot_block: 'evening', slot_label: 'Dinner', target_time: '17:00', meals: [] },
  ];
}

function blankDays() {
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => ({
    day_offset: offset,
    source_plan_day_id: `day-${offset}`,
    source_date_local: `Day ${offset + 1}`,
    source_day_template_id: null,
    slots: blankSlots(offset),
    unassigned_meals: [],
  }));
}

const BLANK_PATTERN = {
  id: 'pattern-1',
  person_id: 'person-1',
  name: 'Blank pattern',
  scope: 'week_pattern',
  source_plan_id: 'plan-1',
  source_date_start: null,
  source_date_end: null,
  days: blankDays(),
  apply_policy: 'append',
  created_at: '2026-07-19T00:16:19.677Z',
  updated_at: '2026-07-19T00:16:19.677Z',
};

const BLANK_TEMPLATE = {
  id: 'template-1',
  person_id: 'person-1',
  name: 'Blank template',
  scope: 'day_template',
  source_plan_id: 'plan-1',
  source_plan_day_id: 'day-0',
  source_date_local: 'Day 1',
  source_day_template_id: null,
  slots: blankSlots(0),
  unassigned_meals: [],
  apply_policy: 'append',
  created_at: '2026-07-19T00:16:19.677Z',
  updated_at: '2026-07-19T00:16:19.677Z',
};

jest.mock('@/lib/plans/planService', () => ({
  planService: {
    getPlanWeekPattern: jest.fn().mockResolvedValue(BLANK_PATTERN),
    getPlanDayTemplate: jest.fn().mockResolvedValue(BLANK_TEMPLATE),
    listPlanDayTemplates: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue([{ id: 'plan-1', status: 'active' }]),
    getDetail: jest.fn().mockResolvedValue({ days: [], meals: [] }),
    updatePlanWeekPattern: jest.fn(),
    updatePlanDayTemplate: jest.fn(),
  },
}));

async function mountAndCheck(pageModulePath: string): Promise<unknown> {
  // ts-jest is configured with the classic JSX transform for tests, which
  // expects a `React` global in scope for the JSX these pages emit.
  (global as unknown as { React: typeof React }).React = React;

  const Page = require(pageModulePath).default;
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  let caughtError: unknown = null;
  const originalOnError = window.onerror;
  window.onerror = (...args) => {
    caughtError = args;
    return true;
  };

  try {
    await act(async () => {
      root = createRoot(container);
      root.render(React.createElement(Page));
    });
    // Flush the initial data-fetch effect's microtasks.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  } finally {
    window.onerror = originalOnError;
    act(() => {
      root?.unmount();
    });
    document.body.removeChild(container);
  }

  return caughtError;
}

describe('Reusable planning detail pages mount without a client/server module-boundary crash', () => {
  test('Week Pattern detail page mounts a freshly-created blank pattern', async () => {
    const err = await mountAndCheck('@/pages/journal/plans/week-patterns/[patternId]');
    expect(err).toBeNull();
  });

  test('Day Template detail page mounts a freshly-created blank template', async () => {
    const err = await mountAndCheck('@/pages/journal/plans/day-templates/[templateId]');
    expect(err).toBeNull();
  });
});
