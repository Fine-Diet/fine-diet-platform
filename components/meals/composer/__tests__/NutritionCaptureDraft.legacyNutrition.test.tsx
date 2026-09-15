/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { createComposerState } from '@/lib/meals/composer/state';
import { templateMealToMealDocument } from '@/lib/meals/adapters';
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

import { NutritionCaptureDraft } from '@/components/meals/composer/NutritionCaptureDraft';
import { composerReducer } from '@/lib/meals/composer/state';

function julyBreakfastMeal(): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: '15c8b25a-788d-42cd-87a3-d9e729607dc6',
    name: 'Stub breakfast',
    meal_type: 'breakfast',
    payload: {
      items: [
        { name: 'Steel-cut oats', calories: 220, macros: { protein: 8, carbs: 38, fat: 4 } },
        { name: 'Blueberries', calories: 50, macros: { protein: 1, carbs: 12, fat: 0 } },
        { name: 'Walnuts', calories: 110, macros: { protein: 3, carbs: 2, fat: 10 } },
      ],
      totals: { calories: 380, protein_g: 12, carbs_g: 52, fat_g: 14 },
    },
    protein_score_10: 4,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: 4,
      is_main_meal: true,
      meal_calories: 380,
      meal_protein_g: 12,
      psq_multiplier: 1,
    },
    nds_confidence: 'low',
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: 'nds_daily_2026-01-26.v10',
    classifier_version: 'processing_classifier_2026-02-08.v2',
  };
}

describe('NutritionCaptureDraft legacy Day Plan nutrition', () => {
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

  it('shows stored snapshot nutrition, Amount not recorded, and a 380 kcal total', () => {
    const state = createComposerState('plan-edit', templateMealToMealDocument(julyBreakfastMeal()));
    act(() => {
      root.render(
        React.createElement(NutritionCaptureDraft, {
          state,
          dispatch: jest.fn(),
          commit: { label: 'Save', onCommit: jest.fn() },
          density: 'compact',
          occasionLabel: 'Breakfast',
        }),
      );
    });

    const names = Array.from(container.querySelectorAll('input[placeholder="Item name"]')) as HTMLInputElement[];
    expect(names.map((input) => input.value)).toEqual(['Steel-cut oats', 'Blueberries', 'Walnuts']);
    expect(container.textContent).toContain('220 kcal · P 8g · C 38g · F 4g');
    expect(container.textContent).toContain('50 kcal · P 1g · C 12g · F 0g');
    expect(container.textContent).toContain('110 kcal · P 3g · C 2g · F 10g');
    expect(container.textContent).toContain('Amount not recorded');
    expect(container.textContent).not.toContain('Nutrition will remain reviewable');
    expect(container.textContent).toContain('380 kcal · P 12g · C 52g · F 14g');

    const quantityInputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const unitInputs = Array.from(container.querySelectorAll('input[type="text"]')).filter(
      (input) => input.getAttribute('placeholder') !== 'Item name',
    ) as HTMLInputElement[];
    expect(quantityInputs.every((input) => input.value === '')).toBe(true);
    expect(unitInputs.every((input) => input.value === '')).toBe(true);
  });

  it('keeps legacy rows countable after a modern grounded item is added', () => {
    let state = createComposerState('plan-edit', templateMealToMealDocument(julyBreakfastMeal()));
    state = composerReducer(state, {
      type: 'ADD_COMPONENT_FROM_SELECTION',
      componentId: 'modern-rice',
      selection: {
        food_object_id: 'food-rice',
        name: 'Rice',
        food: {
          id: 'food-rice',
          calories: 200,
          proteinG: 4,
          carbsG: 44,
          fatG: 0.5,
          servingSizeG: 150,
        } as never,
      },
    });

    act(() => {
      root.render(
        React.createElement(NutritionCaptureDraft, {
          state,
          dispatch: jest.fn(),
          commit: { label: 'Save', onCommit: jest.fn() },
          density: 'compact',
          occasionLabel: 'Breakfast',
        }),
      );
    });

    expect(container.textContent).toContain('220 kcal · P 8g · C 38g · F 4g');
    expect(container.textContent).toContain('Rice');
    expect(container.textContent).not.toContain('Nutrition will remain reviewable');
    expect(container.textContent).toContain('580 kcal · P 16g · C 96g · F 15g');
  });
});
