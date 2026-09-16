/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import type { MealComponent, MealDocument } from '@/lib/meals/types';
import { buildTemplateMealFromDocument } from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanDayTemplateMeal } from '@/lib/plans/types';

jest.mock('@/lib/food/foodService', () => ({
  foodService: {
    searchFoods: jest.fn(async () => []),
    getByBarcode: jest.fn(),
  },
}));

jest.mock('@/lib/logSearch/logSearchService', () => ({
  logSearchService: {
    search: jest.fn(async () => ({ meals: [], foods: [] })),
  },
}));

jest.mock('@/components/journal/BarcodeScanner', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/meals/MealComposerRecipeSearch', () => ({
  MealComposerRecipeSearch: () => null,
}));

import { TemplateMealComposerPanel } from '../TemplateMealComposerPanel';

function component(id: string, name: string, calories: number): MealComponent {
  return {
    component_id: id,
    component_kind: 'user_entered',
    name,
    quantity: 1,
    unit: 'serving',
    food_object_id: `food-${id}`,
    calories,
    macros: { protein_g: calories / 10, carbs_g: 8, fat_g: 3 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
  };
}

function savedMeal(): MealDocument {
  return {
    schema_version: 1,
    document_version: 1,
    id: 'template-protein-power',
    person_id: 'person-1',
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Protein Power Meal',
    description: null,
    intents: [],
    meal_type_hint: 'lunch',
    components: [
      component('chicken', 'Chicken', 200),
      component('rice', 'Rice', 300),
      component('broccoli', 'Broccoli', 50),
    ],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: {
      calories: 550,
      macros: { protein_g: 55, carbs_g: 24, fat_g: 9 },
    },
    source: {
      source_type: 'saved_meal',
      source_template_id: 'template-protein-power',
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}

function insufficientMeal(): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: 'insufficient-1',
    name: 'Draft meal',
    meal_type: 'lunch',
    payload: {
      items: [{
        name: 'Mystery item',
        quantity: 1,
        unit: 'serving',
        food_object_id: null,
        component_id: 'comp-mystery',
      }],
    },
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
    nds_confidence: 'low',
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: 'nds_daily_2026-01-26.v10',
    classifier_version: 'processing_classifier_2026-02-08.v2',
  };
}

function groupedMeal(): PlanDayTemplateMeal {
  let state = createComposerState('plan');
  state = composerReducer(state, {
    type: 'ADD_SAVED_MEAL_GROUP',
    document: savedMeal(),
    groupId: 'capture-meal-1',
  });
  return buildTemplateMealFromDocument(
    state.document,
    'lunch',
    undefined,
    state.authoringGroups,
  );
}

function singleItemMeal(): PlanDayTemplateMeal {
  let state = createComposerState('plan');
  state = composerReducer(state, {
    type: 'ADD_BLANK_COMPONENT',
    componentId: 'capture-single-1',
  });
  state = composerReducer(state, {
    type: 'UPDATE_COMPONENT_NAME',
    componentId: 'capture-single-1',
    name: 'Banana',
  });
  return buildTemplateMealFromDocument(
    state.document,
    'snack',
    undefined,
    state.authoringGroups,
  );
}

function rowTypes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('li p'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter((text) => text === 'Meal' || text === 'Single Item');
}

describe('reusable Day Plan grouped meal and NDS capture UI', () => {
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

  it('renders a Saved Meal with three components as one top-level Meal row', () => {
    const fetchSpy = jest.fn();
    (globalThis as { fetch?: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;
    act(() => {
      root.render(
        <TemplateMealComposerPanel
          mode="edit"
          meal={groupedMeal()}
          presentation="capture-draft"
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });
    expect(rowTypes(container)).toEqual(['Meal']);
    expect(container.textContent).toContain('Protein Power Meal');
    expect(container.textContent).not.toContain('Chicken');
    expect(container.textContent).not.toContain('Rice');
    expect(container.textContent).not.toContain('Broccoli');
    expect(container.textContent).toMatch(/NDS:\s*\d+/);
    expect(container.textContent).not.toMatch(/NDS:\s*—/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still renders one Meal row after save/reopen of the reusable snapshot', () => {
    const original = groupedMeal();
    const reopened = JSON.parse(JSON.stringify(original)) as PlanDayTemplateMeal;
    act(() => {
      root.render(
        <TemplateMealComposerPanel
          mode="edit"
          meal={reopened}
          presentation="capture-draft"
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });
    expect(rowTypes(container)).toEqual(['Meal']);
    expect(container.querySelectorAll('input[type="number"]').length).toBe(1);
  });

  it('renders a Single Item as a Single Item', () => {
    act(() => {
      root.render(
        <TemplateMealComposerPanel
          mode="edit"
          meal={singleItemMeal()}
          presentation="capture-draft"
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });
    expect(rowTypes(container)).toEqual(['Single Item']);
    const names = Array.from(container.querySelectorAll('input[placeholder="Item name"]')) as HTMLInputElement[];
    expect(names.map((input) => input.value)).toEqual(['Banana']);
  });

  it('shows NDS em dash for an empty reusable meal draft without rendering a numeric score', () => {
    act(() => {
      root.render(
        <TemplateMealComposerPanel
          mode="create"
          presentation="capture-draft"
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });
    expect(container.textContent ?? '').not.toMatch(/NDS:\s*\d+/);
  });

  it('shows NDS em dash for a reusable meal with insufficient nutrition', () => {
    act(() => {
      root.render(
        <TemplateMealComposerPanel
          mode="edit"
          meal={insufficientMeal()}
          presentation="capture-draft"
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
      );
    });
    expect(container.textContent).toContain('NDS:');
    expect(container.textContent).not.toMatch(/NDS:\s*\d+/);
  });
});
