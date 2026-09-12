/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import {
  WeekPlanningWorkspace,
  type WeekPlanningWorkspaceProps,
} from '../WeekPlanningWorkspace';

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

function props(
  overrides: Partial<WeekPlanningWorkspaceProps> = {},
): WeekPlanningWorkspaceProps {
  return {
    loadState: 'ready',
    selectedRange: { start: '2026-09-06', end: '2026-09-12' },
    isCurrentWeek: false,
    planDays: [],
    planSlots: [],
    meals: [],
    dayPlans: [],
    weekPlans: [],
    selectedWeekPlan: null,
    busy: false,
    error: null,
    message: null,
    onPreviousWeek: jest.fn(),
    onThisWeek: jest.fn(),
    onNextWeek: jest.fn(),
    onAddDayPlan: jest.fn(),
    onSaveCurrentWeek: jest.fn(),
    onOpenWeekPlan: jest.fn(),
    onNewWeekPlan: jest.fn(),
    onRenameWeekPlan: jest.fn(),
    onCopyWeekPlan: jest.fn(),
    onApplyWeekPlan: jest.fn(),
    ...overrides,
  };
}

describe('Packet 18 Week workspace', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('opens without an active plan and always renders seven dated Day routes', () => {
    act(() => root.render(<WeekPlanningWorkspace {...props()} />));

    expect(container.querySelectorAll('[data-testid="week-day-row"]')).toHaveLength(7);
    expect(
      Array.from(container.querySelectorAll('a'))
        .map((link) => link.getAttribute('href'))
        .filter((href) => href?.startsWith('/app/plans/day/')),
    ).toEqual(expect.arrayContaining([
      '/app/plans/day/2026-09-06',
      '/app/plans/day/2026-09-12',
    ]));
    expect(container.textContent).not.toMatch(/Create your first weekly plan|Pantry Readiness/);
  });

  it('keeps navigation read-only', () => {
    const onPreviousWeek = jest.fn();
    const onAddDayPlan = jest.fn();
    const onSaveCurrentWeek = jest.fn();
    act(() =>
      root.render(
        <WeekPlanningWorkspace
          {...props({ onPreviousWeek, onAddDayPlan, onSaveCurrentWeek })}
        />,
      ),
    );

    act(() => {
      (container.querySelector('[aria-label="Previous week"]') as HTMLButtonElement).click();
    });
    expect(onPreviousWeek).toHaveBeenCalledTimes(1);
    expect(onAddDayPlan).not.toHaveBeenCalled();
    expect(onSaveCurrentWeek).not.toHaveBeenCalled();
  });

  it('opens the reusable Day Plans picker without applying', () => {
    const onAddDayPlan = jest.fn();
    act(() =>
      root.render(<WeekPlanningWorkspace {...props({ onAddDayPlan })} />),
    );

    act(() => {
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Add Day Plan',
      ) as HTMLButtonElement).click();
    });
    expect(container.querySelector('[aria-labelledby="day-plan-picker-title"]')).not.toBeNull();
    expect(container.textContent).toContain('Day Plans Library');
    expect(onAddDayPlan).not.toHaveBeenCalled();
  });

  it('searches Week Plans and keeps copy distinct from apply', () => {
    const weekPlan = {
      id: 'week-1',
      person_id: 'person-1',
      name: 'Training Week',
      scope: 'week_pattern' as const,
      source_plan_id: 'source-1',
      source_date_start: null,
      source_date_end: null,
      days: [],
      apply_policy: 'append' as const,
      created_at: '2026-09-11T00:00:00.000Z',
      updated_at: '2026-09-11T00:00:00.000Z',
    };
    const onCopyWeekPlan = jest.fn();
    const onApplyWeekPlan = jest.fn();
    act(() =>
      root.render(
        <WeekPlanningWorkspace
          {...props({
            weekPlans: [weekPlan],
            selectedWeekPlan: weekPlan,
            onCopyWeekPlan,
            onApplyWeekPlan,
          })}
        />,
      ),
    );

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((button) => button.textContent === 'Make a copy')).toBe(true);
    expect(buttons.some((button) => button.textContent === 'Apply to week')).toBe(true);
    expect(onCopyWeekPlan).not.toHaveBeenCalled();
    expect(onApplyWeekPlan).not.toHaveBeenCalled();

    act(() => {
      (buttons.find((button) => button.textContent === 'Open') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('Week Plans Library');
    expect(container.querySelector('input[placeholder="Search Week Plans"]')).not.toBeNull();
  });
});
