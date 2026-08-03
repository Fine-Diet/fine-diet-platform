/**
 * Founder QA correction — first-run weekly creation must not loop through
 * Plans overview. When there is no active plan, the week command center
 * renders a direct generate CTA.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import {
  WeeklyPlanningCommandCenter,
  type WeeklyPlanningCommandCenterProps,
} from '../WeeklyPlanningCommandCenter';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) =>
    React.createElement('a', { href, ...rest }, children),
}));

function baseProps(
  overrides: Partial<WeeklyPlanningCommandCenterProps> = {},
): WeeklyPlanningCommandCenterProps {
  return {
    loadState: 'ready',
    plan: null,
    hasProfileSchedule: true,
    selectedRange: { start: '2026-07-26', end: '2026-08-01' },
    isCurrentWeek: true,
    weekDays: [],
    planSlots: [],
    meals: [],
    mealCountByDay: {},
    coverage: {
      plannedMeals: 0,
      openSlots: 0,
      totalSlots: 0,
      percent: 0,
      coverageLabel: 'No plan yet',
    },
    decisionLoad: {
      label: 'Low',
      tone: 'green',
      description: 'No decisions yet.',
    },
    execution: { eaten: 0, skipped: 0, pending: 0, hasState: false },
    pantry: {
      headline: 'No active plan yet',
      body: 'Generate a week first.',
      blockerNote: null,
      groceryHref: null,
    },
    templates: [],
    weekPatterns: [],
    groceryRangeHref: null,
    onPrevWeek: jest.fn(),
    onNextWeek: jest.fn(),
    onThisWeek: jest.fn(),
    onCustomRangeChange: jest.fn(),
    canGeneratePlan: true,
    generateMissingReasons: [],
    onGeneratePlan: jest.fn(),
    generatingPlan: false,
    highlightGenerate: false,
    snapshot: null,
    displayPrefs: null,
    onSaveWeekPattern: jest.fn(),
    savingPattern: false,
    onApplyWeekPattern: jest.fn(),
    applyingPatternId: null,
    actionError: null,
    ...overrides,
  };
}

describe('WeeklyPlanningCommandCenter first-run creation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows a direct generate CTA and no overview-loop CTA when there is no plan', () => {
    act(() => {
      root.render(
        React.createElement(WeeklyPlanningCommandCenter, baseProps()),
      );
    });

    expect(
      container.querySelector('[data-testid="first-run-weekly-create"]'),
    ).not.toBeNull();
    const cta = container.querySelector(
      '[data-testid="first-run-generate-cta"]',
    ) as HTMLButtonElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.textContent).toMatch(/Generate this week/);
    expect(cta?.disabled).toBe(false);

    const html = container.textContent ?? '';
    expect(html).not.toMatch(/Open Plans overview/);
    expect(container.querySelector('a[href="/app/plans"]')).toBeNull();
  });

  it('invokes onGeneratePlan from the first-run CTA', () => {
    const onGeneratePlan = jest.fn();
    act(() => {
      root.render(
        React.createElement(
          WeeklyPlanningCommandCenter,
          baseProps({ onGeneratePlan }),
        ),
      );
    });

    const cta = container.querySelector(
      '[data-testid="first-run-generate-cta"]',
    ) as HTMLButtonElement;
    act(() => {
      cta.click();
    });
    expect(onGeneratePlan).toHaveBeenCalledTimes(1);
  });

  it('labels non-current weeks as Create weekly plan', () => {
    act(() => {
      root.render(
        React.createElement(
          WeeklyPlanningCommandCenter,
          baseProps({ isCurrentWeek: false }),
        ),
      );
    });
    expect(
      container.querySelector('[data-testid="first-run-generate-cta"]')
        ?.textContent,
    ).toMatch(/Create weekly plan/);
  });
});
