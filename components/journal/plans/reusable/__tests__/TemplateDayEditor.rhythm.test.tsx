/**
 * Runtime projection of saved Day Plans onto the current meal rhythm.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import type {
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
} from '@/lib/plans/types';

jest.mock('../TemplateMealComposerPanel', () => ({
  TemplateMealComposerPanel: (props: {
    mode: 'create' | 'edit';
    meal?: PlanDayTemplateMeal;
    onSaved?: (meal: PlanDayTemplateMeal) => void;
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'meal-composer',
        'data-mode': props.mode,
        'data-meal-id': props.meal?.source_planned_meal_id ?? '',
        onClick: () =>
          props.onSaved?.({
            source_planned_meal_id: 'added-meal',
            name: 'Added meal',
            meal_type: 'breakfast',
            payload: {
              items: [{
                name: 'Added meal',
                quantity: 1,
                unit: 'serving',
                food_object_id: 'food-added',
                component_id: 'comp-added',
              }],
            },
            protein_score_10: 5,
            is_main_meal: true,
            psq_multiplier: 1,
            meal_derived_data: {
              protein_score_10: 5,
              is_main_meal: true,
              meal_calories: 200,
              meal_protein_g: 20,
              psq_multiplier: 1,
            },
            nds_confidence: 'medium',
            source_template_id: null,
            source_imported_meal_id: null,
            nds_version: 'nds_daily_2026-01-26.v10',
            classifier_version: 'processing_classifier_2026-02-08.v2',
          }),
      },
      props.mode === 'edit' ? props.meal?.name ?? 'edit' : 'create-empty',
    ),
}));

import { TemplateDayEditor } from '../TemplateDayEditor';

function meal(id: string, name: string, mealType: PlanDayTemplateMeal['meal_type'] = 'lunch'): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: id,
    name,
    meal_type: mealType,
    payload: { items: [{ food_id: `food-${id}`, quantity_g: 90 }] },
    protein_score_10: 5,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: 5,
      is_main_meal: true,
      meal_calories: 300,
      meal_protein_g: 20,
      psq_multiplier: 1,
    },
    nds_confidence: 'medium',
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: 'nds_daily_2026-01-26.v10',
    classifier_version: 'processing_classifier_2026-02-08.v2',
  };
}

function slot(args: {
  id: string;
  ordinal: number;
  block: PlanDayTemplateSlot['slot_block'];
  label: string;
  time: string;
  meals?: PlanDayTemplateMeal[];
}): PlanDayTemplateSlot {
  return {
    source_plan_slot_id: args.id,
    slot_ordinal: args.ordinal,
    slot_block: args.block,
    slot_label: args.label,
    target_time: args.time,
    meals: args.meals ?? [],
  };
}

const CURRENT_RHYTHM: PlanDayTemplateSlot[] = [
  slot({ id: 'rhythm-mini-am', ordinal: 1, block: 'morning', label: 'Mini Meal', time: '06:30' }),
  slot({ id: 'rhythm-breakfast', ordinal: 2, block: 'morning', label: 'Breakfast', time: '10:00' }),
  slot({ id: 'rhythm-lunch', ordinal: 3, block: 'midday', label: 'Lunch', time: '11:30' }),
  slot({ id: 'rhythm-mini-pm', ordinal: 4, block: 'midday', label: 'Mini Meal', time: '14:00' }),
  slot({ id: 'rhythm-dinner', ordinal: 5, block: 'evening', label: 'Dinner', time: '17:00' }),
];

function template(slots: PlanDayTemplate['slots']): PlanDayTemplate {
  return {
    id: 'tmpl-rhythm',
    person_id: 'person-1',
    name: 'QA Day — Sep 10',
    description: null,
    scope: 'day',
    source_plan_id: 'plan-1',
    source_plan_day_id: 'day-1',
    source_date_local: '2026-09-01',
    slots,
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

function slotToggles(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter((candidate) => {
    const label = candidate.getAttribute('aria-label') || '';
    return label.startsWith('Expand ') || label.startsWith('Collapse ');
  }) as HTMLButtonElement[];
}

describe('TemplateDayEditor current meal rhythm projection', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onChange: jest.Mock;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChange = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders all five current occasions, maps saved meals, and stays clean on open', () => {
    const current = template([
      slot({
        id: 'saved-mini-am',
        ordinal: 1,
        block: 'morning',
        label: 'Mini Meal',
        time: '06:30',
        meals: [meal('oats', 'Oats', 'snack')],
      }),
      slot({
        id: 'saved-lunch',
        ordinal: 2,
        block: 'midday',
        label: 'Lunch',
        time: '11:30',
        meals: [meal('salmon', 'Salmon', 'lunch')],
      }),
    ]);

    act(() => {
      root.render(
        <TemplateDayEditor
          template={current}
          rhythmSlots={CURRENT_RHYTHM}
          onChange={onChange}
        />,
      );
    });

    expect(slotToggles(container)).toHaveLength(5);
    expect(onChange).not.toHaveBeenCalled();

    act(() => slotToggles(container)[0]!.click());
    expect(container.querySelector('[data-testid="meal-composer"]')?.getAttribute('data-mode')).toBe('edit');
    expect(container.querySelector('[data-testid="meal-composer"]')?.textContent).toContain('Oats');

    act(() => slotToggles(container)[0]!.click());
    act(() => slotToggles(container)[1]!.click());
    expect(container.querySelector('[data-testid="meal-composer"]')?.getAttribute('data-mode')).toBe('create');

    act(() => slotToggles(container)[1]!.click());
    act(() => slotToggles(container)[2]!.click());
    expect(container.querySelector('[data-testid="meal-composer"]')?.textContent).toContain('Salmon');

    act(() => slotToggles(container)[2]!.click());
    act(() => slotToggles(container)[3]!.click());
    expect(container.querySelector('[data-testid="meal-composer"]')?.getAttribute('data-mode')).toBe('create');

    act(() => slotToggles(container)[3]!.click());
    act(() => slotToggles(container)[4]!.click());
    expect(container.querySelector('[data-testid="meal-composer"]')?.getAttribute('data-mode')).toBe('create');
  });

  it('materializes a scaffold-only occasion only after the user adds a meal', () => {
    const current = template([
      slot({
        id: 'saved-lunch',
        ordinal: 2,
        block: 'midday',
        label: 'Lunch',
        time: '11:30',
        meals: [meal('salmon', 'Salmon', 'lunch')],
      }),
    ]);

    act(() => {
      root.render(
        <TemplateDayEditor
          template={current}
          rhythmSlots={CURRENT_RHYTHM}
          onChange={onChange}
        />,
      );
    });

    expect(onChange).not.toHaveBeenCalled();
    act(() => slotToggles(container)[1]!.click());
    act(() => (container.querySelector('[data-testid="meal-composer"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as PlanDayTemplate;
    expect(next.slots.map((slot) => slot.source_plan_slot_id)).toEqual([
      'saved-lunch',
      'rhythm-breakfast',
    ]);
    expect(next.slots.find((slot) => slot.source_plan_slot_id === 'rhythm-breakfast')?.meals[0]?.name)
      .toBe('Added meal');
  });

  it('keeps unmatched saved populated content visible', () => {
    const current = template([
      slot({
        id: 'saved-late',
        ordinal: 9,
        block: 'evening',
        label: 'Late Snack',
        time: '21:00',
        meals: [meal('yogurt', 'Yogurt', 'snack')],
      }),
    ]);

    act(() => {
      root.render(
        <TemplateDayEditor
          template={current}
          rhythmSlots={CURRENT_RHYTHM}
          onChange={onChange}
        />,
      );
    });

    expect(slotToggles(container)).toHaveLength(6);
    expect(container.textContent).toContain('Late Snack');
    act(() => slotToggles(container)[5]!.click());
    expect(container.querySelector('[data-testid="meal-composer"]')?.textContent).toContain('Yogurt');
    expect(onChange).not.toHaveBeenCalled();
  });
});
