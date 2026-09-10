import type { FoodSearchResult } from '@/lib/food/types';
import {
  addLogNutritionDraftEntry,
  buildJournalPayloadForDraftEntry,
  buildMealDocumentFromLogDraft,
  createLogNutritionDraft,
  getDraftEntryNutrition,
  getLogNutritionDraftStorageKey,
  mealDraftEntryFromDocument,
  parseLogNutritionDraft,
  removeLogNutritionDraftEntry,
  serializeLogNutritionDraft,
  singleItemDraftEntryFromFoodResult,
  updateLogNutritionDraftEntry,
  type LogNutritionDraftContextV1,
} from '@/lib/logDraft/logNutritionDraft';
import { MEAL_SCHEMA_VERSION, type MealDocument } from '@/lib/meals/types';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const CONTEXT: LogNutritionDraftContextV1 = {
  personId: 'person-a',
  date: '2026-09-09',
  time: '08:00',
  occasionKey: 'occasion_1@08:00',
  mealSlot: 'occasion_1',
  plannedMealId: null,
  redirect: '/app/log',
};

function foodResult(id: string, name: string): FoodSearchResult {
  return {
    food: {
      id,
      personId: null,
      canonicalName: name,
      brandName: null,
      sourceType: 'common',
      sourceProvider: 'usda',
      sourceDataset: 'foundation',
      sourceId: id,
      servingSizeG: 100,
      servingUnit: 'g',
      servingDescription: null,
      householdServingText: null,
      calories: 200,
      proteinG: 20,
      carbsG: 10,
      fatG: 5,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
      nutrientsExtended: {},
      measures: [{ unit: 'cup', grams: 200 }],
      createdAt: NOW,
      updatedAt: NOW,
    },
    group: 'common',
    score: 1,
    isFavorite: false,
    logCount: 0,
  } as FoodSearchResult;
}

function mealDocument(foodId = 'inside-food'): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    document_version: 1,
    id: '11111111-1111-4111-8111-111111111111',
    person_id: 'person-a',
    kind: 'meal',
    review_state: 'confirmed',
    lifecycle_state: 'active',
    archived_at: null,
    title: 'Saved Meal',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [
      {
        component_id: 'component-1',
        component_kind: 'food_concept',
        name: 'Inside food',
        quantity: 1,
        unit: 'serving',
        food_object_id: foodId,
        serving_size_g: 100,
        calories: 400,
        macros: { protein_g: 30, carbs_g: 40, fat_g: 12 },
        nutrition_basis: 'per_serving',
        match_status: 'matched',
        source_kind: 'food_object',
        needs_review: false,
      },
    ],
    yield: { servings: 1, yield_label: 'serving', confirmed: true },
    recipe_yield_servings: 1,
    serving_label: 'serving',
    prep_notes: null,
    per_serving: {
      calories: 400,
      macros: { protein_g: 30, carbs_g: 40, fat_g: 12 },
    },
    totals: {
      calories: 400,
      macros: { protein_g: 30, carbs_g: 40, fat_g: 12 },
    },
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

describe('LogNutritionDraftV1', () => {
  it('keeps add, edit, and remove local with one top-level food entry', () => {
    const initial = createLogNutritionDraft(CONTEXT, {
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      now: NOW,
    });
    const food = singleItemDraftEntryFromFoodResult(foodResult('food-1', 'Chicken'), {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
    });
    const added = addLogNutritionDraftEntry(initial, food, NOW).draft;
    expect(added.entries).toHaveLength(1);

    const edited = updateLogNutritionDraftEntry(
      added,
      food.id,
      { quantity: 3, unit: 'serving' },
      NOW,
    );
    expect(edited.entries).toHaveLength(1);
    expect(edited.entries[0].quantity).toBe(3);

    const removed = removeLogNutritionDraftEntry(edited, food.id, NOW);
    expect(removed.entries).toHaveLength(0);
  });

  it('focuses an existing duplicate top-level food instead of adding another', () => {
    const draft = createLogNutritionDraft(CONTEXT, { now: NOW });
    const first = singleItemDraftEntryFromFoodResult(foodResult('food-1', 'Chicken'), {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
    });
    const duplicate = singleItemDraftEntryFromFoodResult(foodResult('food-1', 'Chicken'), {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      now: NOW,
    });
    const once = addLogNutritionDraftEntry(draft, first, NOW).draft;
    const twice = addLogNutritionDraftEntry(once, duplicate, NOW);
    expect(twice.duplicate).toBe(true);
    expect(twice.entryId).toBe(first.id);
    expect(twice.draft.entries).toHaveLength(1);
  });

  it('keeps a Saved Meal grouped and allows the same internal food as a peer Single Item', () => {
    const draft = createLogNutritionDraft(CONTEXT, { now: NOW });
    const meal = mealDraftEntryFromDocument(mealDocument('same-food'), {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
    });
    const food = singleItemDraftEntryFromFoodResult(foodResult('same-food', 'Inside food'), {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      now: NOW,
    });
    const withMeal = addLogNutritionDraftEntry(draft, meal, NOW).draft;
    const withBoth = addLogNutritionDraftEntry(withMeal, food, NOW).draft;
    expect(withBoth.entries).toHaveLength(2);
    expect(withBoth.entries.map((entry) => entry.kind)).toEqual(['meal', 'single_item']);
    expect(meal.quantity).toBe(1);
    expect(meal.unit).toBe('serving');

    const payload = buildJournalPayloadForDraftEntry(meal);
    expect(payload.meal_group).toBeDefined();
    expect((payload.meal_group as { components: unknown[] }).components).toHaveLength(1);
  });

  it('scales fractional Saved Meal servings without changing entry count', () => {
    const initial = createLogNutritionDraft(CONTEXT, { now: NOW });
    const meal = mealDraftEntryFromDocument(mealDocument(), {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
    });
    const added = addLogNutritionDraftEntry(initial, meal, NOW).draft;
    const edited = updateLogNutritionDraftEntry(added, meal.id, { quantity: 0.5 }, NOW);
    expect(edited.entries).toHaveLength(1);
    expect(getDraftEntryNutrition(edited.entries[0])?.calories).toBe(200);
    expect(
      (buildJournalPayloadForDraftEntry(edited.entries[0]).meal_group as {
        consumed_servings: number;
      }).consumed_servings,
    ).toBe(0.5);
  });

  it('restores only the exact person/date/time/occasion context', () => {
    const draft = createLogNutritionDraft(CONTEXT, { now: NOW });
    const serialized = serializeLogNutritionDraft(draft);
    expect(parseLogNutritionDraft(serialized, CONTEXT)).toEqual(draft);
    expect(
      parseLogNutritionDraft(serialized, { ...CONTEXT, personId: 'person-b' }),
    ).toBeNull();
    expect(
      parseLogNutritionDraft(serialized, {
        ...CONTEXT,
        occasionKey: 'occasion_2@10:00',
      }),
    ).toBeNull();
    expect(getLogNutritionDraftStorageKey(CONTEXT)).not.toBe(
      getLogNutritionDraftStorageKey({ ...CONTEXT, time: '09:00' }),
    );
  });

  it('builds a reusable Meal without mutating or consuming the active draft', () => {
    const initial = createLogNutritionDraft(CONTEXT, { now: NOW });
    const food = singleItemDraftEntryFromFoodResult(foodResult('food-1', 'Chicken'), {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
    });
    const draft = addLogNutritionDraftEntry(initial, food, NOW).draft;
    const snapshot = serializeLogNutritionDraft(draft);
    const document = buildMealDocumentFromLogDraft(draft, 'Reusable lunch');
    expect(document.title).toBe('Reusable lunch');
    expect(document.components).toHaveLength(1);
    expect(serializeLogNutritionDraft(draft)).toBe(snapshot);
  });
});
