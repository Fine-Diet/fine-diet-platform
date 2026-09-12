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

function props(
  overrides: Partial<MonthCalendarProjectionProps> = {},
): MonthCalendarProjectionProps {
  return {
    loadState: 'ready',
    monthKey: '2026-10',
    visibleDates: getVisibleCalendarDates('2026-10'),
    planDays: [],
    planSlots: [],
    meals: [],
    isCurrentMonth: false,
    onPreviousMonth: jest.fn(),
    onCurrentMonth: jest.fn(),
    onNextMonth: jest.fn(),
    ...overrides,
  };
}

describe('Packet 19 Month calendar UI', () => {
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
    expect(container.textContent).not.toMatch(/Unnamed Month Plan|Make a copy|Save/);
  });

  it('routes every date to dated Day planning without invoking navigation writes', () => {
    const onPreviousMonth = jest.fn();
    const onCurrentMonth = jest.fn();
    const onNextMonth = jest.fn();
    act(() =>
      root.render(
        <MonthCalendarProjection
          {...props({ onPreviousMonth, onCurrentMonth, onNextMonth })}
        />,
      ),
    );

    expect(
      container.querySelector('[data-date="2026-10-05"]')?.getAttribute('href'),
    ).toBe('/app/plans/day/2026-10-05');

    act(() => {
      (container.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click();
      (container.querySelector('[aria-label="Next month"]') as HTMLButtonElement).click();
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'This month',
      ) as HTMLButtonElement).click();
    });

    expect(onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(onCurrentMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
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
});
