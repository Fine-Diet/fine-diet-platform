/**
 * Runtime hydration for TemplateDayEditor: create/edit/legacy modes,
 * source_plan_slot_id resolution, and display sorting.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import type { PlanDayTemplate, PlanDayTemplateMeal } from '@/lib/plans/types';

jest.mock('../TemplateMealComposerPanel', () => ({
  TemplateMealComposerPanel: (props: {
    mode: 'create' | 'edit';
    meal?: PlanDayTemplateMeal;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'meal-composer',
        'data-mode': props.mode,
        'data-meal-id': props.meal?.source_planned_meal_id ?? '',
      },
      props.mode === 'edit' ? props.meal?.name ?? 'edit' : 'create-empty',
    ),
}));

import { TemplateDayEditor } from '../TemplateDayEditor';

function meal(
  id: string,
  name: string,
  mealType: PlanDayTemplateMeal['meal_type'] = 'lunch',
): PlanDayTemplateMeal {
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

function template(slots: PlanDayTemplate['slots']): PlanDayTemplate {
  return {
    id: 'tmpl-hydrate',
    person_id: 'person-1',
    name: 'Hydration fixture',
    description: 'Saved meals in storage order that is not display order',
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

function findByLabel(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    (candidate.getAttribute('aria-label') || '').includes(label),
  );
  if (!button) throw new Error(`Labeled button not found: ${label}`);
  return button as HTMLButtonElement;
}

describe('TemplateDayEditor saved-meal hydration', () => {
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

  it('enters edit for one saved meal, create for none, and legacy review for multiple', () => {
    const current = template([
      {
        source_plan_slot_id: 'slot-empty',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [],
      },
      {
        source_plan_slot_id: 'slot-one',
        slot_ordinal: 2,
        slot_block: 'midday',
        slot_label: 'Lunch',
        target_time: '12:00',
        meals: [meal('meal-one', 'Salmon bowl')],
      },
      {
        source_plan_slot_id: 'slot-legacy',
        slot_ordinal: 3,
        slot_block: 'evening',
        slot_label: 'Dinner',
        target_time: '18:00',
        meals: [meal('meal-a', 'Soup', 'dinner'), meal('meal-b', 'Bread', 'dinner')],
      },
    ]);

    act(() => {
      root.render(<TemplateDayEditor template={current} onChange={onChange} />);
    });

    act(() => findByLabel(container, 'Expand Breakfast').click());
    expect(container.querySelector('[data-testid="meal-composer"]')?.getAttribute('data-mode')).toBe(
      'create',
    );

    act(() => findByLabel(container, 'Collapse Breakfast').click());
    act(() => findByLabel(container, 'Expand Lunch').click());
    const lunchComposer = container.querySelector('[data-testid="meal-composer"]') as HTMLElement;
    expect(lunchComposer.getAttribute('data-mode')).toBe('edit');
    expect(lunchComposer.getAttribute('data-meal-id')).toBe('meal-one');
    expect(lunchComposer.textContent).toContain('Salmon bowl');

    act(() => findByLabel(container, 'Collapse Lunch').click());
    act(() => findByLabel(container, 'Expand Dinner').click());
    expect(container.textContent).toContain('multiple Meal containers in one occasion');
    expect(container.textContent).toContain('Soup');
    expect(container.textContent).toContain('Bread');
    expect(container.querySelector('[data-testid="meal-composer"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps meals on their source_plan_slot_id when display sort reorders occasions', () => {
    const current = template([
      {
        source_plan_slot_id: 'slot-late-storage-first',
        slot_ordinal: 2,
        slot_block: 'evening',
        slot_label: 'Dinner',
        target_time: '18:30',
        meals: [meal('meal-dinner', 'Roast chicken', 'dinner')],
      },
      {
        source_plan_slot_id: 'slot-early-storage-second',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '07:30',
        meals: [meal('meal-breakfast', 'Overnight oats', 'breakfast')],
      },
    ]);

    act(() => {
      root.render(<TemplateDayEditor template={current} onChange={onChange} />);
    });

    const labels = Array.from(container.querySelectorAll('p.text-lg')).map((node) => node.textContent);
    expect(labels[0]).toBe('Breakfast');
    expect(labels[1]).toBe('Dinner');

    act(() => findByLabel(container, 'Expand Breakfast').click());
    const composer = container.querySelector('[data-testid="meal-composer"]') as HTMLElement;
    expect(composer.getAttribute('data-mode')).toBe('edit');
    expect(composer.getAttribute('data-meal-id')).toBe('meal-breakfast');
    expect(composer.textContent).toContain('Overnight oats');
    expect(onChange).not.toHaveBeenCalled();
  });
});
