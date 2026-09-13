/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import type { Plan, PlanDay, PlanDayTemplate, PlanSlot, PlannedMeal } from '@/lib/plans';

let routerQuery: Record<string, string | undefined> = { month: '2026-10' };
const push = jest.fn((href: { pathname?: string; query?: { month?: string } } | string) => {
  if (typeof href === 'object' && href.query?.month) {
    routerQuery = { month: href.query.month };
  } else {
    routerQuery = {};
  }
});

jest.mock('next/router', () => ({
  useRouter: () => ({
    isReady: true,
    query: routerQuery,
    push,
    replace: jest.fn(),
  }),
}));

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
  }) => React.createElement('a', { href, ...rest }, children),
}));

jest.mock('@/components/journal/JournalFooterNav', () => ({
  JournalFooterNav: () => null,
}));

const planService = {
  list: jest.fn(),
  getDetail: jest.fn(),
  listPlanDayTemplates: jest.fn(),
  getPlanDayDraftSeed: jest.fn(),
  instantiatePlanDayTemplate: jest.fn(),
  savePlanDayTemplate: jest.fn(),
  deleteMeal: jest.fn(),
  updateMeal: jest.fn(),
  createMeal: jest.fn(),
};

jest.mock('@/lib/plans', () => {
  const actual = jest.requireActual('@/lib/plans');
  return {
    ...actual,
    planService,
  };
});

import MonthCalendarProjectionPage from '../MonthCalendarProjectionPage';

function coveringPlan(): Plan {
  return {
    id: 'plan-cover',
    person_id: 'person-1',
    start_date: '2026-10-01',
    end_date: '2026-11-30',
    plan_shape: 'multi_day',
    status: 'active',
    source: 'ai_generated',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    name: 'Covering plan',
  } as Plan;
}

function day(dateLocal: string, id: string): PlanDay {
  return {
    id,
    plan_id: 'plan-cover',
    person_id: 'person-1',
    date_local: dateLocal,
  } as PlanDay;
}

function slot(id: string, planDayId: string): PlanSlot {
  return {
    id,
    plan_id: 'plan-cover',
    plan_day_id: planDayId,
    person_id: 'person-1',
    slot_ordinal: 1,
  } as PlanSlot;
}

function meal(id: string, planDayId: string, planSlotId: string, name: string): PlannedMeal {
  return {
    id,
    plan_id: 'plan-cover',
    plan_day_id: planDayId,
    plan_slot_id: planSlotId,
    person_id: 'person-1',
    name,
    execution_state: 'pending',
    payload: { items: [{ name }] },
  } as PlannedMeal;
}

const octoberDay = day('2026-10-15', 'day-oct');
const novemberDay = day('2026-11-15', 'day-nov');
const octoberSlot = slot('slot-oct', octoberDay.id);
const novemberSlot = slot('slot-nov', novemberDay.id);
const octoberMeal = meal('meal-oct', octoberDay.id, octoberSlot.id, 'October Breakfast');
const novemberMeal = meal('meal-nov', novemberDay.id, novemberSlot.id, 'November Lunch');

function reusableTemplate(): PlanDayTemplate {
  return {
    id: 'template-training',
    person_id: 'person-1',
    name: 'Training Day',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'reusable-day',
    source_date_local: '',
    slots: [],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-04T08:15:00.000Z',
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Packet 19 Correction C4 — post-mutation Month refresh identity', () => {
  let container: HTMLDivElement;
  let root: Root;
  let resolveApply: ((value: unknown) => void) | null;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.confirm = jest.fn(() => true);
    routerQuery = { month: '2026-10' };
    push.mockClear();
    resolveApply = null;

    planService.list.mockResolvedValue([coveringPlan()]);
    planService.getDetail.mockResolvedValue({
      plan: coveringPlan(),
      days: [octoberDay, novemberDay],
      slots: [octoberSlot, novemberSlot],
      meals: [octoberMeal, novemberMeal],
    });
    planService.listPlanDayTemplates.mockResolvedValue([reusableTemplate()]);
    planService.getPlanDayDraftSeed.mockResolvedValue({
      person_id: 'person-1',
      slots: [],
    });
    planService.savePlanDayTemplate.mockResolvedValue({
      ...reusableTemplate(),
      id: 'saved-now',
    });
    planService.instantiatePlanDayTemplate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not apply month A refresh data after the user has navigated to month B', async () => {
    await act(async () => {
      root.render(<MonthCalendarProjectionPage />);
    });
    await flush();

    expect(container.textContent).toContain('October 2026');
    expect(container.querySelector('[data-date="2026-10-15"]')?.getAttribute('data-planned')).toBe('true');

    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      const apply = Array.from(
        container.querySelectorAll('[data-testid="embedded-day-planner"] button'),
      ).find((button) => /Save & apply|Apply Day Plan/.test(button.textContent || '')) as HTMLButtonElement;
      apply.click();
    });

    act(() => {
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === 'Close Day Plan',
      ) as HTMLButtonElement).click();
    });

    act(() => {
      (container.querySelector('[aria-label="Next month"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      root.render(<MonthCalendarProjectionPage />);
    });
    await flush();

    expect(container.textContent).toContain('November 2026');
    expect(container.querySelector('[data-date="2026-11-15"]')?.getAttribute('data-planned')).toBe('true');

    await act(async () => {
      resolveApply?.(undefined);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain('November 2026');
    expect(container.querySelector('[data-date="2026-11-15"]')?.getAttribute('data-planned')).toBe('true');
    expect(container.querySelector('[data-date="2026-10-15"]')).toBeNull();
  });
});
