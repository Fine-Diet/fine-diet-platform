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
import { blankDayTemplateForDateContext } from '@/lib/plans/monthProjectionLoad';
import { getVisibleCalendarDates } from '@/lib/plans/monthProjection';
import type { PlanDayTemplate } from '@/lib/plans';

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

const profileSeedSlots: PlanDayTemplate['slots'] = [{
  source_plan_slot_id: 'profile-slot',
  slot_ordinal: 1,
  slot_block: 'morning',
  slot_label: 'Breakfast',
  target_time: '08:00',
  meals: [],
}];

function productionLikeBlankTemplateForDate(dateLocal: string): PlanDayTemplate {
  return blankDayTemplateForDateContext({
    personId: 'person-1',
    dateLocal,
    profileSeedSlots,
    coveringPlan: null,
  });
}

function reusableDayPlan(): PlanDayTemplate {
  return {
    id: 'template-training',
    person_id: 'person-1',
    name: 'Training Day',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'reusable-day',
    source_date_local: '',
    slots: [{
      source_plan_slot_id: 'slot-1',
      slot_ordinal: 1,
      slot_block: 'morning',
      slot_label: 'Breakfast',
      target_time: '08:00',
      meals: [],
    }],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-04T08:15:00.000Z',
  };
}

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
    dayPlans: [reusableDayPlan()],
    dayDraftSeed: productionLikeBlankTemplateForDate('2026-10-05'),
    blankTemplateForDate: productionLikeBlankTemplateForDate,
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

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(label),
  ) as HTMLButtonElement;
}

function plannerActionButton(container: HTMLElement): HTMLButtonElement {
  const planner = container.querySelector('[data-testid="embedded-day-planner"]') as HTMLElement;
  return Array.from(planner.querySelectorAll('button')).find((button) =>
    /Save & apply|Make a copy & apply|Apply Day Plan|Save Day/.test(button.textContent || ''),
  ) as HTMLButtonElement;
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Packet 19 Correction C1 — production seed churn must not reset the Day editor', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.confirm = jest.fn(() => true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps a staged reusable draft through tab, search, and busy/error rerenders', () => {
    const current = props();
    act(() => root.render(<MonthCalendarProjection {...current} />));

    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });
    act(() => {
      findButton(container, 'Day Plan Library').click();
    });
    act(() => {
      findButton(container, 'Training Day').click();
    });

    const nameInput = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Training Day');

    act(() => {
      typeInto(nameInput, 'Training Day edited');
    });
    expect(plannerActionButton(container).textContent).toContain('Make a copy & apply');

    act(() => {
      findButton(container, 'Day Plan Library').click();
    });
    const search = container.querySelector('input[placeholder="Search Day Plans"]') as HTMLInputElement;
    act(() => {
      typeInto(search, 'Train');
    });
    act(() => {
      findButton(container, 'Create or Edit').click();
    });

    act(() =>
      root.render(
        <MonthCalendarProjection
          {...current}
          busy
          modalError="Apply failed"
        />,
      ),
    );

    expect(
      (container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement).value,
    ).toBe('Training Day edited');
    expect(container.querySelector('[data-testid="embedded-day-planner"]')).not.toBeNull();

    act(() =>
      root.render(
        <MonthCalendarProjection
          {...current}
          busy={false}
          modalError="Apply failed"
        />,
      ),
    );

    expect(
      (container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement).value,
    ).toBe('Training Day edited');
    expect(plannerActionButton(container).textContent).toContain('Make a copy & apply');
  });

  it('keeps a saved-but-not-applied identity after Apply error and parent rerenders', async () => {
    const saved = {
      ...reusableDayPlan(),
      id: 'saved-1',
      name: 'Saved retry Day',
      updated_at: '2026-10-05T12:00:00.000Z',
    };
    const onCreateAndApply = jest.fn().mockResolvedValue({
      outcome: 'cancelled',
      savedTemplateId: 'saved-1',
      savedTemplate: saved,
      applyError: 'Apply failed',
    });
    const current = props({ onCreateAndApply, dayPlans: [] });
    act(() => root.render(<MonthCalendarProjection {...current} />));

    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });
    const nameInput = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    act(() => {
      typeInto(nameInput, 'Saved retry Day');
    });

    await act(async () => {
      plannerActionButton(container).click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Day Plan saved. Apply it to this date when you are ready.');
    expect(plannerActionButton(container).textContent).toContain('Apply Day Plan');

    act(() =>
      root.render(
        <MonthCalendarProjection
          {...current}
          busy={false}
          modalError="Apply failed"
        />,
      ),
    );

    expect(container.textContent).toContain('Day Plan saved. Apply it to this date when you are ready.');
    expect(plannerActionButton(container).textContent).toContain('Apply Day Plan');
    expect(
      (container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement).value,
    ).toBe('Saved retry Day');
  });
});
