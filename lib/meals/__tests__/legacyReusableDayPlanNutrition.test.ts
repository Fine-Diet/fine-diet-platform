import {
  mealDocumentToPlannedMealPayload,
  plannedMealToMealDocument,
  templateMealToMealDocument,
} from '../adapters';
import { composerReducer, createComposerState } from '../composer/state';
import { recomputeMealNutrition } from '../recompute';
import type { MealComponent } from '../types';
import type { PlanDayTemplateMeal } from '@/lib/plans/types';

const JULY_BREAKFAST_ITEMS = [
  { name: 'Steel-cut oats', calories: 220, macros: { protein: 8, carbs: 38, fat: 4 } },
  { name: 'Blueberries', calories: 50, macros: { protein: 1, carbs: 12, fat: 0 } },
  { name: 'Walnuts', calories: 110, macros: { protein: 3, carbs: 2, fat: 10 } },
] as const;

const JULY_BREAKFAST_TOTALS = {
  calories: 380,
  protein_g: 12,
  carbs_g: 52,
  fat_g: 14,
};

function julyBreakfastMeal(): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: '15c8b25a-788d-42cd-87a3-d9e729607dc6',
    name: 'Stub breakfast',
    meal_type: 'breakfast',
    payload: {
      items: JULY_BREAKFAST_ITEMS.map((item) => ({ ...item })),
      totals: { ...JULY_BREAKFAST_TOTALS },
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

function expectNoInventedAmount(component: MealComponent) {
  expect(component.quantity == null || component.quantity === undefined).toBe(true);
  expect(component.unit == null || component.unit === '').toBe(true);
}

describe('legacy reusable Day Plan nutrition compatibility', () => {
  it('hydrates a legacy component with nutrition and no quantity/unit', () => {
    const doc = templateMealToMealDocument(julyBreakfastMeal());
    const oats = doc.components.find((component) => component.name === 'Steel-cut oats');
    expect(oats).toMatchObject({
      calories: 220,
      macros: { protein_g: 8, carbs_g: 38, fat_g: 4 },
      food_object_id: null,
    });
    expectNoInventedAmount(oats!);
  });

  it('hydrates a legacy component with nutrition and no food_object_id', () => {
    const doc = plannedMealToMealDocument({
      id: 'pm-legacy',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: 'slot-1',
      person_id: 'person-1',
      name: 'Stub breakfast',
      meal_type: 'breakfast',
      payload: {
        items: [{ name: 'Steel-cut oats', calories: 220, macros: { protein: 8, carbs: 38, fat: 4 } }],
        totals: { calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4 },
      },
      source_template_id: null,
      source_imported_meal_id: null,
      reusable_provenance: null,
      execution_state: 'pending',
      journal_entry_id: null,
      protein_score_10: 4,
      is_main_meal: true,
      psq_multiplier: 1,
      meal_derived_data: {
        protein_score_10: 4,
        is_main_meal: true,
        meal_calories: 220,
        meal_protein_g: 8,
        psq_multiplier: 1,
      },
      nds_confidence: 'low',
      nds_version: null,
      classifier_version: null,
      created_at: '2026-07-12T00:00:00.000Z',
      updated_at: '2026-07-12T00:00:00.000Z',
    });
    expect(doc.components[0]?.food_object_id).toBeNull();
    expect(doc.components[0]?.calories).toBe(220);
    expectNoInventedAmount(doc.components[0]!);
  });

  it('counts legacy absolute nutrition in the meal total', () => {
    const doc = templateMealToMealDocument(julyBreakfastMeal());
    const result = recomputeMealNutrition(doc.components);
    expect(result.needs_review).toBe(false);
    expect(result.recomputed_count).toBe(3);
    expect(result.totals).toEqual({
      calories: 380,
      macros: { protein_g: 12, carbs_g: 52, fat_g: 14 },
    });
  });

  it('recomputes the exact 380 kcal July Breakfast fixture without inventing servings', () => {
    const doc = templateMealToMealDocument(julyBreakfastMeal());
    const byName = Object.fromEntries(doc.components.map((component) => [component.name, component]));
    expect(recomputeMealNutrition([byName['Steel-cut oats']!]).totals).toEqual({
      calories: 220,
      macros: { protein_g: 8, carbs_g: 38, fat_g: 4 },
    });
    expect(recomputeMealNutrition([byName.Blueberries!]).totals).toEqual({
      calories: 50,
      macros: { protein_g: 1, carbs_g: 12, fat_g: 0 },
    });
    expect(recomputeMealNutrition([byName.Walnuts!]).totals).toEqual({
      calories: 110,
      macros: { protein_g: 3, carbs_g: 2, fat_g: 10 },
    });
    expect(recomputeMealNutrition(doc.components).totals.calories).toBe(380);
    doc.components.forEach(expectNoInventedAmount);
    expect(doc.components.every((component) => !component.food_object_id)).toBe(true);
  });

  it('aggregates a modern grounded food with the legacy snapshot contributions', () => {
    const seed = templateMealToMealDocument(julyBreakfastMeal());
    let state = createComposerState('plan-edit', seed);
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

    const oats = state.document.components.find((component) => component.name === 'Steel-cut oats');
    const rice = state.document.components.find((component) => component.name === 'Rice');
    expect(oats?.calories).toBe(220);
    expectNoInventedAmount(oats!);
    expect(rice?.calories).toBe(200);
    expect(rice?.quantity).toBe(1);
    expect(rice?.unit).toBe('serving');
    expect(rice?.food_object_id).toBe('food-rice');

    const result = recomputeMealNutrition(state.document.components);
    expect(result.totals.calories).toBe(580);
    expect(result.totals.macros).toEqual({
      protein_g: 16,
      carbs_g: 96,
      fat_g: 14.5,
    });
    expect(state.document.totals?.calories).toBe(580);

    const payload = mealDocumentToPlannedMealPayload(state.document) as {
      items: Array<{ name?: string; calories?: number; quantity?: number; unit?: string }>;
      totals: { calories: number };
    };
    const oatsItem = payload.items.find((item) => item.name === 'Steel-cut oats');
    expect(oatsItem?.calories).toBe(220);
    expect(oatsItem?.quantity).toBeUndefined();
    expect(oatsItem?.unit).toBeUndefined();
    expect(payload.totals.calories).toBe(580);
  });

  it('does not invent quantity or unit when writing the legacy snapshot back', () => {
    const doc = templateMealToMealDocument(julyBreakfastMeal());
    const payload = mealDocumentToPlannedMealPayload(doc) as {
      items: Array<{ name?: string; quantity?: number; unit?: string; food_object_id?: string | null }>;
    };
    for (const item of payload.items) {
      expect(item.quantity).toBeUndefined();
      expect(item.unit).toBeUndefined();
      expect(item.food_object_id ?? null).toBeNull();
    }
  });
});
