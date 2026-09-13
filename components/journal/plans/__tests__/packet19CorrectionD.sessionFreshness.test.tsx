/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { EmbeddedDayPlanner, type EmbeddedDayPlannerProps } from '../EmbeddedDayPlanner';
import {
  MonthCalendarProjection,
  type MonthCalendarProjectionProps,
} from '../MonthCalendarProjection';
import { blankDayTemplateForDateContext } from '@/lib/plans/monthProjectionLoad';
import { getVisibleCalendarDates } from '@/lib/plans/monthProjection';
import type { PlanDay, PlanDayTemplate, PlanSlot, PlannedMeal } from '@/lib/plans';

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

function datedTemplate(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: '',
    person_id: 'person-1',
    name: '(Autosaved) Day of Oct 5, 2026',
    scope: 'day',
    source_plan_id: 'plan-1',
    source_plan_day_id: 'day-1',
    source_date_local: '2026-10-05',
    slots: [{
      source_plan_slot_id: 'slot-1',
      slot_ordinal: 1,
      slot_block: 'morning',
      slot_label: 'Breakfast',
      target_time: '08:00',
      meals: [{
        source_planned_meal_id: 'meal-a',
        name: 'Oats A',
        meal_type: 'breakfast',
        payload: {},
        protein_score_10: null,
        is_main_meal: false,
        psq_multiplier: 1,
        meal_derived_data: {
          protein_score_10: null,
          is_main_meal: false,
          meal_calories: 0,
          meal_protein_g: 0,
          psq_multiplier: 1,
        },
        nds_confidence: 'medium',
        source_template_id: null,
        source_imported_meal_id: null,
        nds_version: 'nds',
        classifier_version: 'clf',
      }],
    }],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-05T08:00:00.000Z',
    ...overrides,
  };
}

function reusableDayPlan(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
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
    ...overrides,
  };
}

function plannerProps(
  overrides: Partial<EmbeddedDayPlannerProps> = {},
): EmbeddedDayPlannerProps {
  const blank = productionLikeBlankTemplateForDate('2026-10-05');
  return {
    dateLocal: '2026-10-05',
    blankTemplate: blank,
    datedTemplate: datedTemplate(),
    templates: [reusableDayPlan()],
    busy: false,
    draftContext: 'month',
    onApplyReusable: jest.fn().mockResolvedValue('applied'),
    onCreateAndApply: jest.fn().mockResolvedValue({ outcome: 'applied' }),
    onSaveDated: jest.fn().mockResolvedValue('applied'),
    onApplied: jest.fn(),
    ...overrides,
  };
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function nameInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(label),
  ) as HTMLButtonElement;
}

function planDay(updatedAt: string, id = 'day-1'): PlanDay {
  return {
    id,
    plan_id: 'plan-1',
    person_id: 'person-1',
    date_local: '2026-10-05',
    notes: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: updatedAt,
  } as PlanDay;
}

function planSlot(): PlanSlot {
  return {
    id: 'slot-1',
    plan_day_id: 'day-1',
    person_id: 'person-1',
    slot_block: 'morning',
    slot_ordinal: 1,
    slot_label: 'Breakfast',
    target_time: '08:00',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-05T08:00:00.000Z',
  } as PlanSlot;
}

function plannedMeal(name: string, id: string): PlannedMeal {
  return {
    id,
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    person_id: 'person-1',
    name,
    meal_type: 'breakfast',
    payload: {},
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: null,
      is_main_meal: false,
      meal_calories: 0,
      meal_protein_g: 0,
      psq_multiplier: 1,
    },
    nds_confidence: 'medium',
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: 'nds',
    classifier_version: 'clf',
  } as PlannedMeal;
}

function monthProps(
  overrides: Partial<MonthCalendarProjectionProps> = {},
): MonthCalendarProjectionProps {
  return {
    loadState: 'ready',
    monthKey: '2026-10',
    visibleDates: getVisibleCalendarDates('2026-10'),
    planDays: [planDay('2026-10-05T08:00:00.000Z')],
    planSlots: [planSlot()],
    meals: [plannedMeal('Oats A', 'meal-a')],
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

describe('Packet 19 Correction D C5 — EmbeddedDayPlanner session restore', () => {
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

  it('keeps a dirty dated draft through same-version object churn', () => {
    const versionA = datedTemplate();
    act(() => root.render(<EmbeddedDayPlanner {...plannerProps({ datedTemplate: versionA })} />));
    act(() => {
      typeInto(nameInput(container), 'Stale draft A');
    });

    const churned = datedTemplate({
      slots: versionA.slots.map((slot) => ({
        ...slot,
        meals: slot.meals.map((meal) => ({ ...meal })),
      })),
    });
    act(() =>
      root.render(
        <EmbeddedDayPlanner
          {...plannerProps({
            datedTemplate: churned,
            blankTemplate: productionLikeBlankTemplateForDate('2026-10-05'),
          })}
        />,
      ),
    );

    expect(nameInput(container).value).toBe('Stale draft A');
    expect(container.textContent).toContain('Oats A');
    expect(findButton(container, 'Save Day')).not.toBeNull();
  });

  it('reopens from the newest dated canonical content after updated_at changes', () => {
    act(() => root.render(<EmbeddedDayPlanner {...plannerProps()} />));
    act(() => {
      typeInto(nameInput(container), 'Stale draft A');
    });

    const versionB = datedTemplate({
      name: '(Autosaved) Day of Oct 5, 2026',
      updated_at: '2026-10-06T12:00:00.000Z',
      slots: [{
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [{
          source_planned_meal_id: 'meal-b',
          name: 'Oats B',
          meal_type: 'breakfast',
          payload: {},
          protein_score_10: null,
          is_main_meal: false,
          psq_multiplier: 1,
          meal_derived_data: {
            protein_score_10: null,
            is_main_meal: false,
            meal_calories: 0,
            meal_protein_g: 0,
            psq_multiplier: 1,
          },
          nds_confidence: 'medium',
          source_template_id: null,
          source_imported_meal_id: null,
          nds_version: 'nds',
          classifier_version: 'clf',
        }],
      }],
    });

    act(() =>
      root.render(
        <EmbeddedDayPlanner
          key="reopen-b"
          {...plannerProps({ datedTemplate: versionB })}
        />,
      ),
    );

    expect(nameInput(container).value).not.toBe('Stale draft A');
    expect(container.textContent).toContain('Oats B');
    expect(container.textContent).not.toContain('Oats A');
  });

  it('does not attach a stale dated session to a replaced PlanDay identity', () => {
    act(() => root.render(<EmbeddedDayPlanner {...plannerProps()} />));
    act(() => {
      typeInto(nameInput(container), 'Stale draft A');
    });

    const replacement = datedTemplate({
      source_plan_day_id: 'day-2',
      name: 'Replacement Day',
      updated_at: '2026-10-07T09:00:00.000Z',
      slots: [{
        source_plan_slot_id: 'slot-2',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [{
          source_planned_meal_id: 'meal-replacement',
          name: 'Replacement oats',
          meal_type: 'breakfast',
          payload: {},
          protein_score_10: null,
          is_main_meal: false,
          psq_multiplier: 1,
          meal_derived_data: {
            protein_score_10: null,
            is_main_meal: false,
            meal_calories: 0,
            meal_protein_g: 0,
            psq_multiplier: 1,
          },
          nds_confidence: 'medium',
          source_template_id: null,
          source_imported_meal_id: null,
          nds_version: 'nds',
          classifier_version: 'clf',
        }],
      }],
    });

    act(() =>
      root.render(
        <EmbeddedDayPlanner
          key="replaced-day"
          {...plannerProps({ datedTemplate: replacement })}
        />,
      ),
    );

    expect(nameInput(container).value).toBe('Replacement Day');
    expect(container.textContent).toContain('Replacement oats');
    expect(container.textContent).not.toContain('Oats A');
  });

  it('restores a reusable session only while the reusable identity and version match', () => {
    act(() => root.render(<EmbeddedDayPlanner {...plannerProps({ datedTemplate: null })} />));
    act(() => {
      (container.querySelector('summary') as HTMLElement).click();
    });
    act(() => {
      findButton(container, 'Training Day').click();
    });
    act(() => {
      typeInto(nameInput(container), 'Training Day edited');
    });

    act(() =>
      root.render(
        <EmbeddedDayPlanner
          key="reusable-same"
          {...plannerProps({
            datedTemplate: null,
            templates: [reusableDayPlan()],
          })}
        />,
      ),
    );
    expect(nameInput(container).value).toBe('Training Day edited');

    act(() =>
      root.render(
        <EmbeddedDayPlanner
          key="reusable-changed"
          {...plannerProps({
            datedTemplate: null,
            templates: [reusableDayPlan({ updated_at: '2026-10-08T10:00:00.000Z', name: 'Training Day v2' })],
          })}
        />,
      ),
    );
    expect(nameInput(container).value).toBe('Unnamed Day Plan');
    expect(nameInput(container).value).not.toBe('Training Day edited');
  });

  it('falls back to the current dated canonical source when a reusable session is deleted', () => {
    act(() => root.render(<EmbeddedDayPlanner {...plannerProps()} />));
    act(() => {
      (container.querySelector('summary') as HTMLElement).click();
    });
    act(() => {
      findButton(container, 'Training Day').click();
    });
    act(() => {
      typeInto(nameInput(container), 'Training Day edited');
    });

    act(() =>
      root.render(
        <EmbeddedDayPlanner
          key="reusable-deleted"
          {...plannerProps({ templates: [] })}
        />,
      ),
    );

    expect(nameInput(container).value).not.toBe('Training Day edited');
    expect(container.textContent).toContain('Oats A');
    expect(findButton(container, 'Save Day')).not.toBeNull();
  });
});

describe('Packet 19 Correction D C5 — Month dated reopen', () => {
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

  it('keeps a dirty dated Month draft when planDays churn at the same version', () => {
    const current = monthProps();
    act(() => root.render(<MonthCalendarProjection {...current} />));
    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });
    act(() => {
      findButton(container, 'Create or Edit').click();
    });
    act(() => {
      typeInto(nameInput(container), 'Stale draft A');
    });

    act(() =>
      root.render(
        <MonthCalendarProjection
          {...current}
          planDays={[{ ...current.planDays[0]! }]}
          planSlots={[{ ...current.planSlots[0]! }]}
          meals={[{ ...current.meals[0]! }]}
        />,
      ),
    );

    expect(nameInput(container).value).toBe('Stale draft A');
    expect(container.textContent).toContain('Oats A');
  });

  it('shows the newer dated Month snapshot instead of restoring stale local content', () => {
    const current = monthProps();
    act(() => root.render(<MonthCalendarProjection {...current} />));
    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });
    act(() => {
      findButton(container, 'Create or Edit').click();
    });
    act(() => {
      typeInto(nameInput(container), 'Stale draft A');
    });

    act(() =>
      root.render(
        <MonthCalendarProjection
          {...current}
          planDays={[planDay('2026-10-06T12:00:00.000Z')]}
          meals={[plannedMeal('Oats B', 'meal-b')]}
        />,
      ),
    );

    expect(nameInput(container).value).not.toBe('Stale draft A');
    expect(container.textContent).toContain('Oats B');
    expect(container.textContent).not.toContain('Oats A');
  });
});
