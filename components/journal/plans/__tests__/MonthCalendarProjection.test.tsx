/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import {
  MonthCalendarProjection,
  type MonthCalendarProjectionProps,
} from '../MonthCalendarProjection';
import { getVisibleCalendarDates } from '@/lib/plans/monthProjection';

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

function dayDraftSeed() {
  return {
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
}

function props(
  overrides: Partial<MonthCalendarProjectionProps> = {},
): MonthCalendarProjectionProps {
  const seed = dayDraftSeed();
  return {
    loadState: 'ready',
    monthKey: '2026-10',
    visibleDates: getVisibleCalendarDates('2026-10'),
    planDays: [],
    planSlots: [],
    meals: [],
    dayPlans: [],
    dayDraftSeed: seed,
    blankTemplateForDate: () => seed,
    busy: false,
    modalError: null,
    isCurrentMonth: false,
    onPreviousMonth: jest.fn(),
    onCurrentMonth: jest.fn(),
    onNextMonth: jest.fn(),
    onApplyReusable: jest.fn().mockResolvedValue('applied'),
    onCreateAndApply: jest.fn().mockResolvedValue({ outcome: 'applied' }),
    onSaveDated: jest.fn().mockResolvedValue('applied'),
    onDayPlanCommitted: jest.fn(),
    ...overrides,
  };
}

describe('Packet 19 Correction A Month calendar UI', () => {
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

  it('opens without an active plan and renders seven-column calendar rows', () => {
    act(() => root.render(<MonthCalendarProjection {...props()} />));

    expect(container.querySelectorAll('[data-testid="month-day-cell"]')).toHaveLength(35);
    expect(container.querySelectorAll('[data-in-month="false"]')).toHaveLength(4);
    expect(container.textContent).toContain('October 2026');
    expect(container.textContent).not.toMatch(/Unnamed Month Plan|Make a copy|Save as/);
  });

  it('opens the Day Plan modal for an exact date instead of routing away', () => {
    const onApplyReusable = jest.fn();
    act(() =>
      root.render(<MonthCalendarProjection {...props({ onApplyReusable })} />),
    );

    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('[aria-labelledby="month-day-context-modal-title"]')).not.toBeNull();
    expect(container.textContent).toContain('Day Plan');
    expect(container.textContent).toContain('Day Plan Library');
    expect(container.textContent).toContain('Create or Edit');
    expect(container.textContent).toContain('Planning Monday, October 5');
    expect(container.querySelector('[data-testid="embedded-day-planner"]')).not.toBeNull();
    expect(onApplyReusable).not.toHaveBeenCalled();
    expect(container.querySelector('[data-date="2026-10-05"]')?.tagName).toBe('BUTTON');
  });

  it('opens library from Open and requires an explicit date before create-edit apply', () => {
    act(() => root.render(<MonthCalendarProjection {...props()} />));

    act(() => {
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Open',
      ) as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain('Day Plan Library');
    expect(container.textContent).toContain('No matching Day Plans.');
    expect(container.querySelector('[data-testid="embedded-day-planner"]')).toBeNull();
  });

  it('keeps month navigation read-only', () => {
    const onPreviousMonth = jest.fn();
    const onApplyReusable = jest.fn();
    act(() =>
      root.render(
        <MonthCalendarProjection
          {...props({ onPreviousMonth, onApplyReusable })}
        />,
      ),
    );

    act(() => {
      (container.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click();
    });
    expect(onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(onApplyReusable).not.toHaveBeenCalled();
  });

  it('distinguishes planned state from an existing empty dated day', () => {
    const planDay = {
      id: 'day-1',
      plan_id: 'plan-1',
      person_id: 'person-1',
      date_local: '2026-10-05',
    } as MonthCalendarProjectionProps['planDays'][number];
    const emptyDay = {
      ...planDay,
      id: 'day-2',
      date_local: '2026-10-06',
    };
    const slot = {
      id: 'slot-1',
      plan_day_id: planDay.id,
      person_id: planDay.person_id,
      slot_ordinal: 1,
    } as MonthCalendarProjectionProps['planSlots'][number];
    const meal = {
      id: 'meal-1',
      plan_id: planDay.plan_id,
      plan_day_id: planDay.id,
      plan_slot_id: slot.id,
      person_id: planDay.person_id,
      name: 'Breakfast',
      payload: { items: [{ name: 'Eggs' }, { name: 'Toast' }] },
    } as MonthCalendarProjectionProps['meals'][number];

    act(() =>
      root.render(
        <MonthCalendarProjection
          {...props({
            planDays: [planDay, emptyDay],
            planSlots: [slot],
            meals: [meal],
          })}
        />,
      ),
    );

    expect(container.querySelector('[data-date="2026-10-05"]')?.getAttribute('data-planned')).toBe('true');
    expect(container.querySelector('[data-date="2026-10-06"]')?.getAttribute('data-planned')).toBe('false');
    expect(container.querySelector('[data-date="2026-10-05"]')?.getAttribute('aria-label')).toContain('1 occasion planned');
    expect(container.querySelector('[data-date="2026-10-06"]')?.getAttribute('aria-label')).toContain('Dated day is empty');
  });

  it('stages a reusable Day Plan from the library without applying', () => {
    const onApplyReusable = jest.fn();
    const dayPlan = {
      ...dayDraftSeed(),
      id: 'template-1',
      name: 'Training Day',
      slots: [{
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [],
      }],
    };
    act(() =>
      root.render(
        <MonthCalendarProjection
          {...props({
            dayPlans: [dayPlan],
            onApplyReusable,
          })}
        />,
      ),
    );

    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });
    const dialog = container.querySelector('[aria-labelledby="month-day-context-modal-title"]');
    act(() => {
      (Array.from(dialog?.querySelectorAll('[role="tab"]') ?? []).find(
        (tab) => tab.textContent === 'Day Plan Library',
      ) as HTMLButtonElement).click();
    });
    act(() => {
      (Array.from(dialog?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent?.includes('Training Day'),
      ) as HTMLButtonElement).click();
    });

    expect(
      (container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement).value,
    ).toBe('Training Day');
    expect(container.querySelector('[data-testid="embedded-day-planner"]')).not.toBeNull();
    expect(onApplyReusable).not.toHaveBeenCalled();
  });
});
