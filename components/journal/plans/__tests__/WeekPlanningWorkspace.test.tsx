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
import { defaultWeekPlanName } from '@/lib/plans/weekWorkspace';

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
    dayDraftSeed: null,
    personId: 'person-1',
    weekPlans: [],
    selectedWeekPlan: null,
    busy: false,
    error: null,
    message: null,
    onPreviousWeek: jest.fn(),
    onThisWeek: jest.fn(),
    onNextWeek: jest.fn(),
    onAddDayPlan: jest.fn(),
    onCreateAndApplyDayPlan: jest.fn(),
    onSaveDatedDay: jest.fn(),
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

  it('opens without an active plan and always renders seven dated rows', () => {
    act(() => root.render(<WeekPlanningWorkspace {...props()} />));

    expect(container.querySelectorAll('[data-testid="week-day-row"]')).toHaveLength(7);
    expect(
      (container.querySelector('input[aria-label="Week Plan name"]') as HTMLInputElement).value,
    ).toBe(defaultWeekPlanName('2026-09-06'));
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

  it('opens the shared contextual modal on Create or Edit with the row date bound', () => {
    const onAddDayPlan = jest.fn();
    const dayDraftSeed = {
      id: '',
      person_id: 'person-1',
      name: 'Unnamed Day Plan',
      scope: 'day' as const,
      source_plan_id: '',
      source_plan_day_id: 'seed',
      source_date_local: '',
      slots: [],
      unassigned_meals: [],
      apply_policy: 'append' as const,
      created_at: '',
      updated_at: '',
    };
    act(() =>
      root.render(<WeekPlanningWorkspace {...props({ onAddDayPlan, dayDraftSeed })} />),
    );

    act(() => {
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Add Day Plan',
      ) as HTMLButtonElement).click();
    });
    expect(container.querySelector('[aria-labelledby="week-context-modal-title"]')).not.toBeNull();
    expect(container.textContent).toContain('Create or Edit');
    expect(container.textContent).toContain('Planning Sunday, September 6');
    expect(container.querySelector('[data-testid="embedded-day-planner"]')).not.toBeNull();
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

  it('requires a current-week date after switching Week Open to Create or Edit', () => {
    act(() => root.render(<WeekPlanningWorkspace {...props()} />));
    act(() => {
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Open',
      ) as HTMLButtonElement).click();
    });
    act(() => {
      (Array.from(container.querySelectorAll('[role="tab"]')).find(
        (button) => button.textContent === 'Create or Edit',
      ) as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('Choose a day to create or edit');
    expect(container.querySelector('[data-testid="embedded-day-planner"]')).toBeNull();
  });

  it('expands an occupied occasion summary and edits the exact dated snapshot', () => {
    const planDay = {
      id: 'day-1',
      plan_id: 'plan-1',
      person_id: 'person-1',
      date_local: '2026-09-06',
      projected_nds_100: 82,
      created_at: '',
      updated_at: '',
    } as WeekPlanningWorkspaceProps['planDays'][number];
    const slot = {
      id: 'slot-1',
      plan_day_id: planDay.id,
      person_id: 'person-1',
      slot_block: 'morning',
      slot_ordinal: 1,
      slot_label: 'Breakfast',
      target_time: '08:00',
      created_at: '',
      updated_at: '',
    } as WeekPlanningWorkspaceProps['planSlots'][number];
    const meal = {
      id: 'meal-1',
      plan_id: 'plan-1',
      plan_day_id: planDay.id,
      plan_slot_id: slot.id,
      person_id: 'person-1',
      name: 'Yogurt bowl',
      meal_type: 'breakfast',
      payload: { items: [{ name: 'Greek yogurt' }], totals: { calories: 220 } },
      source_template_id: 'saved-1',
      meal_derived_data: { meal_calories: 220 },
      execution_state: 'pending',
      created_at: '',
      updated_at: '',
    } as WeekPlanningWorkspaceProps['meals'][number];
    const dayDraftSeed = {
      id: '',
      person_id: 'person-1',
      name: 'Unnamed Day Plan',
      scope: 'day',
      source_plan_id: '',
      source_plan_day_id: 'seed',
      source_date_local: '',
      slots: [],
      created_at: '',
      updated_at: '',
    } as WeekPlanningWorkspaceProps['dayDraftSeed'];

    act(() =>
      root.render(
        <WeekPlanningWorkspace
          {...props({
            planDays: [planDay],
            planSlots: [slot],
            meals: [meal],
            dayDraftSeed,
          })}
        />,
      ),
    );
    act(() => {
      (container.querySelector('article [aria-expanded="false"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('Yogurt bowl');
    expect(container.textContent).toContain('NDS 82');
    expect(container.querySelector('[data-testid="occupied-day-summary-2026-09-06"]')).not.toBeNull();

    act(() => {
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Edit Day',
      ) as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('Planning Sunday, September 6');
    expect(container.querySelector('[data-testid="embedded-day-planner"]')).not.toBeNull();
  });
});
