import { interpretFoodQuery, qualifyFoodPreparation } from '@/lib/food/preparationInterpretation';
import type { FoodSearchResult } from '@/lib/food/types';
import { buildCommittedSingleItemPayload } from '@/lib/journal/committedNutritionEdit';
import {
  addLogNutritionDraftEntry,
  applyDisplayedAmountToReplacement,
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

    const withUnresolved = {
      ...added,
      entries: added.entries.map((entry) =>
        entry.kind === 'single_item'
          ? { ...entry, unresolvedQuantityLabel: '1 cup' }
          : entry,
      ),
    };
    const cleared = updateLogNutritionDraftEntry(withUnresolved, food.id, { quantity: 2 }, NOW);
    expect(cleared.entries[0].kind === 'single_item' && cleared.entries[0].unresolvedQuantityLabel).toBeNull();
    expect(cleared.entries[0].kind === 'single_item' && cleared.entries[0].preparationNote).toBe(
      'Original requested amount: 1 cup.',
    );
    const unitCleared = updateLogNutritionDraftEntry(withUnresolved, food.id, { unit: 'g' }, NOW);
    expect(unitCleared.entries[0].kind === 'single_item' && unitCleared.entries[0].unresolvedQuantityLabel).toBeNull();
    expect(unitCleared.entries[0].kind === 'single_item' && unitCleared.entries[0].preparationNote).toBe(
      'Original requested amount: 1 cup.',
    );
    const kept = updateLogNutritionDraftEntry(withUnresolved, food.id, { quantity: 1, unit: 'cup' }, NOW);
    expect(kept.entries[0].kind === 'single_item' && kept.entries[0].unresolvedQuantityLabel).toBe('1 cup');
    expect(kept.entries[0].quantity).toBe(1);
    expect(kept.entries[0].unit).toBe('cup');

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

  it('stages an exact planned Meal once as one grouped top-level entry', () => {
    const draft = createLogNutritionDraft(
      { ...CONTEXT, plannedMealId: 'planned-meal-1' },
      { now: NOW },
    );
    const first = mealDraftEntryFromDocument(mealDocument(), {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
      sourceKey: 'planned:planned-meal-1',
      plannedMealId: 'planned-meal-1',
      plannedMode: 'exact',
    });
    const rerendered = mealDraftEntryFromDocument(mealDocument(), {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      now: NOW,
      sourceKey: 'planned:planned-meal-1',
      plannedMealId: 'planned-meal-1',
      plannedMode: 'exact',
    });

    const once = addLogNutritionDraftEntry(draft, first, NOW).draft;
    const twice = addLogNutritionDraftEntry(once, rerendered, NOW);

    expect(twice.duplicate).toBe(true);
    expect(twice.draft.entries).toHaveLength(1);
    expect(twice.draft.entries[0]).toEqual(
      expect.objectContaining({
        kind: 'meal',
        plannedMealId: 'planned-meal-1',
        plannedMode: 'exact',
        quantity: 1,
        unit: 'serving',
      }),
    );
    expect(
      buildJournalPayloadForDraftEntry(twice.draft.entries[0]).meal_group,
    ).toBeDefined();
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

  it('clears the current amount warning in the draft and the replacement editor without dropping source notes', () => {
    const query = interpretFoodQuery('1 cup roasted broccoli with butter');
    const match = qualifyFoodPreparation(
      'Broccoli, roasted',
      query,
      null,
      91,
    );
    const result = foodResult('broccoli-roasted', 'Broccoli, roasted');
    result.food.measures = null;
    result.food.servingSizeG = 91;
    result.food.calories = 47;
    result.food.fatG = 0.5;
    result.preparationMatch = match ?? undefined;

    const selected = singleItemDraftEntryFromFoodResult(result, {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
    });
    expect(selected.quantity).toBe(91);
    expect(selected.unit).toBe('g');
    expect(selected.unresolvedQuantityLabel).toBe('1 cup');
    expect(selected.preparationNote).toContain('Butter is not stated on this record.');
    expect(selected.preparationNote).not.toContain('Requested amount:');
    expect(selected.calories).toBe(47);
    expect(selected.title).toBe('Broccoli, roasted');

    const draft = addLogNutritionDraftEntry(
      createLogNutritionDraft(CONTEXT, { now: NOW }),
      selected,
      NOW,
    ).draft;
    const draftEdited = updateLogNutritionDraftEntry(draft, selected.id, { quantity: 2, unit: 'g' }, NOW);
    const draftEntry = draftEdited.entries[0];
    expect(draftEntry.kind).toBe('single_item');
    if (draftEntry.kind !== 'single_item') return;
    expect(draftEntry.unresolvedQuantityLabel).toBeNull();
    expect(draftEntry.preparationNote).toContain('Butter is not stated on this record.');
    expect(draftEntry.preparationNote).toContain('Original requested amount: 1 cup.');
    expect(draftEntry.preparationNote).not.toContain('Requested amount: 1 cup');
    expect(draftEntry.calories).toBe(47);
    expect(draftEntry.foodObjectId).toBe('broccoli-roasted');
    const draftPayload = buildJournalPayloadForDraftEntry(draftEntry);
    expect(draftPayload).not.toHaveProperty('preparationNote');
    expect(draftPayload).not.toHaveProperty('unresolvedQuantityLabel');
    expect(draftPayload.name).toBe('Broccoli, roasted');
    expect(draftPayload.calories).toBe(47);
    expect(draftPayload.quantity).toBe(2);
    expect(draftPayload.unit).toBe('g');

    const quantityEdited = applyDisplayedAmountToReplacement(selected, {
      quantity: '2',
      unit: 'g',
    });
    expect(quantityEdited.unresolvedQuantityLabel).toBeNull();
    expect(quantityEdited.preparationNote).toContain('Butter is not stated on this record.');
    expect(quantityEdited.preparationNote).toContain('Original requested amount: 1 cup.');
    expect(quantityEdited.preparationNote).not.toContain('Requested amount: 1 cup');
    expect(quantityEdited.title).toBe('Broccoli, roasted');
    expect(quantityEdited.calories).toBe(47);
    expect(quantityEdited.macros.fat).toBe(0.5);

    const unitEdited = applyDisplayedAmountToReplacement(selected, {
      quantity: '1',
      unit: 'serving',
    });
    expect(unitEdited.unresolvedQuantityLabel).toBeNull();
    expect(unitEdited.preparationNote).toContain('Original requested amount: 1 cup.');
    expect(unitEdited.preparationNote).toContain('Butter is not stated on this record.');
    expect(unitEdited.calories).toBe(47);

    const saved = buildCommittedSingleItemPayload({
      current: { name: 'Previous item', quantity: 1, unit: 'serving' },
      replacement: quantityEdited,
      quantity: quantityEdited.quantity,
      unit: quantityEdited.unit,
    });
    expect(saved).not.toHaveProperty('preparationNote');
    expect(saved).not.toHaveProperty('unresolvedQuantityLabel');
    expect(saved.name).toBe('Broccoli, roasted');
    expect(saved.calories).toBe(47);
    expect(saved.quantity).toBe(2);
    expect(saved.unit).toBe('g');
    expect(JSON.stringify(saved)).not.toContain('Original requested amount');
  });

  it.each([
    ['1 cup roasted broccoli with butter', '1 cup'],
    ['0.5 cup roasted broccoli with butter', '0.5 cup'],
    ['1.5 cups roasted broccoli with butter', '1.5 cup'],
    ['1/2 cup roasted broccoli with butter', '0.5 cup'],
  ])(
    'keeps the source explanation when %s cannot be converted',
    (queryText, requestedAmount) => {
      const sourceExplanation =
        'Requested: roasted, with butter. Listed as: roasted. Butter is not stated on this record.';
      const match = qualifyFoodPreparation(
        'Broccoli, roasted',
        interpretFoodQuery(queryText),
        null,
        91,
      );
      const result = foodResult('broccoli-roasted', 'Broccoli, roasted');
      result.food.measures = null;
      result.food.servingSizeG = 91;
      result.food.servingUnit = 'g';
      result.food.calories = 47;
      result.food.proteinG = 3;
      result.food.fatG = 0.5;
      result.preparationMatch = match ?? undefined;

      const selected = singleItemDraftEntryFromFoodResult(result, {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        now: NOW,
      });
      expect(selected.quantity).toBe(91);
      expect(selected.unit).toBe('g');
      expect(selected.unresolvedQuantityLabel).toBe(requestedAmount);
      expect(selected.preparationNote).toBe(sourceExplanation);
      expect(selected.preparationNote).not.toContain('Requested amount:');
      expect(selected.preparationNote).not.toMatch(/(^|\s)5 cup/);
      expect(selected.title).toBe('Broccoli, roasted');
      expect(selected.foodObjectId).toBe('broccoli-roasted');
      expect(selected.calories).toBe(47);
      expect(selected.macros).toEqual({ protein: 3, carbs: 10, fat: 0.5 });

      const original = `Original requested amount: ${requestedAmount}.`;
      const draft = addLogNutritionDraftEntry(
        createLogNutritionDraft(CONTEXT, { now: NOW }),
        selected,
        NOW,
      ).draft;
      const draftEdited = updateLogNutritionDraftEntry(
        draft,
        selected.id,
        { quantity: 2, unit: 'g' },
        NOW,
      );
      const draftEntry = draftEdited.entries[0];
      expect(draftEntry.kind).toBe('single_item');
      if (draftEntry.kind !== 'single_item') return;
      expect(draftEntry.quantity).toBe(2);
      expect(draftEntry.unit).toBe('g');
      expect(draftEntry.unresolvedQuantityLabel).toBeNull();
      expect(draftEntry.preparationNote).toBe(`${sourceExplanation} ${original}`);
      expect(draftEntry.preparationNote?.split('Original requested amount:')).toHaveLength(2);
      expect(draftEntry.calories).toBe(47);
      expect(draftEntry.foodObjectId).toBe('broccoli-roasted');
      const draftPayload = buildJournalPayloadForDraftEntry(draftEntry);
      expect(draftPayload).not.toHaveProperty('preparationNote');
      expect(draftPayload).not.toHaveProperty('unresolvedQuantityLabel');
      expect(draftPayload.name).toBe('Broccoli, roasted');
      expect(draftPayload.calories).toBe(47);
      expect(JSON.stringify(draftPayload)).not.toContain(requestedAmount);

      const quantityEdited = applyDisplayedAmountToReplacement(selected, {
        quantity: '2',
        unit: 'g',
      });
      const unitEdited = applyDisplayedAmountToReplacement(selected, {
        quantity: '1',
        unit: 'serving',
      });
      for (const edited of [quantityEdited, unitEdited]) {
        expect(edited.unresolvedQuantityLabel).toBeNull();
        expect(edited.preparationNote).toBe(`${sourceExplanation} ${original}`);
        expect(edited.preparationNote?.split('Original requested amount:')).toHaveLength(2);
        expect(edited.preparationNote).not.toMatch(/(^|\s)5 cup/);
        expect(edited.title).toBe('Broccoli, roasted');
        expect(edited.calories).toBe(47);
        expect(edited.macros.fat).toBe(0.5);
        expect(edited.foodObjectId).toBe('broccoli-roasted');
      }
      const saved = buildCommittedSingleItemPayload({
        current: { name: 'Previous item', quantity: 1, unit: 'serving', calories: 10 },
        replacement: quantityEdited,
        quantity: quantityEdited.quantity,
        unit: quantityEdited.unit,
      });
      expect(saved).not.toHaveProperty('preparationNote');
      expect(saved).not.toHaveProperty('unresolvedQuantityLabel');
      expect(saved.name).toBe('Broccoli, roasted');
      expect(saved.calories).toBe(47);
      expect(saved.foodObjectId).toBe('broccoli-roasted');
      expect(JSON.stringify(saved)).not.toContain('Original requested amount');
      expect(JSON.stringify(saved)).not.toContain(requestedAmount);
    },
  );

  it('still applies a supported decimal cup without an unresolved amount', () => {
    const match = qualifyFoodPreparation(
      'Broccoli, roasted',
      interpretFoodQuery('1.5 cups roasted broccoli with butter'),
      [{ unit: 'cup', grams: 156 }],
      91,
    );
    const result = foodResult('broccoli-roasted', 'Broccoli, roasted');
    result.food.calories = 47;
    result.food.fatG = 0.5;
    result.preparationMatch = match ?? undefined;
    const selected = singleItemDraftEntryFromFoodResult(result, {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: NOW,
    });
    expect(selected.quantity).toBe(1.5);
    expect(selected.unit).toBe('cup');
    expect(selected.unresolvedQuantityLabel ?? null).toBeNull();
    expect(selected.preparationNote).toBe(
      'Requested: roasted, with butter. Listed as: roasted. Butter is not stated on this record.',
    );
    expect(selected.calories).toBe(47);
    expect(selected.title).toBe('Broccoli, roasted');
  });
});
