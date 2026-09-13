/**
 * NDS-01 checkpoint A regression matrix.
 *
 * Fixtures are built with the REAL production payload builders
 * (`buildGroupedMealIntakePayload`, `buildExactPlannedMealIntakePayload`) rather
 * than hand-crafted normalized objects, so the tests fail if the write path and
 * the read path ever disagree about quantity basis again.
 */

import {
  normalizeConsumedDay,
  normalizeConsumedEntry,
  type ConsumedEntryRow,
} from '../normalizeConsumedEntry';
import {
  NDS_NORMALIZER_VERSION,
  type ConsumedFoodEvidence,
  emptyMicronutrients,
} from '../types';
import { buildGroupedMealIntakePayload } from '@/lib/meals/groupedMealPayload';
import {
  buildAdjustedPlannedMealIntakePayload,
  buildExactPlannedMealIntakePayload,
} from '@/lib/plans/plannedMealExecutionPayload';
import type { PlannedMeal } from '@/lib/plans/types';
import type {
  MealComponent,
  MealDocument,
  MealNutritionBasis,
} from '@/lib/meals/types';
import { buildConsumedDayMetadata } from '../../dayIdentity';

// ---------------------------------------------------------------------------
// Builders for real source objects
// ---------------------------------------------------------------------------

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: overrides.component_id ?? 'c1',
    name: 'Black beans',
    component_kind: 'food_concept',
    quantity: 1,
    unit: 'serving',
    food_object_id: null,
    calories: 100,
    macros: { protein_g: 7, carbs_g: 20, fat_g: 0.5, fiber_g: 6, added_sugar_g: 0 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'user_entered',
    needs_review: false,
    ...overrides,
  };
}

function mealDocument(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    id: 'doc-1',
    kind: 'meal',
    title: 'Bean Bowl',
    components: [component()],
    per_serving: {
      calories: 300,
      macros: { protein_g: 20, carbs_g: 40, fat_g: 6, fiber_g: 12, added_sugar_g: 2 },
    },
    totals: {
      calories: 300,
      macros: { protein_g: 20, carbs_g: 40, fat_g: 6, fiber_g: 12, added_sugar_g: 2 },
    },
    nutrition_status: 'calculated',
    review_state: 'confirmed',
    recipe_yield_servings: null,
    source: {},
    ...overrides,
  } as MealDocument;
}

function row(overrides: Partial<ConsumedEntryRow> = {}): ConsumedEntryRow {
  return {
    id: 'entry-1',
    person_id: 'person-1',
    entry_type: 'intake',
    occurred_at: '2026-09-12T18:30:00.000Z',
    payload: {},
    quantity_g: null,
    ...overrides,
  };
}

function evidence(overrides: Partial<ConsumedFoodEvidence> = {}): ConsumedFoodEvidence {
  return {
    foodObjectId: 'food-1',
    canonicalName: 'Rolled oats',
    brandName: null,
    category: 'grains',
    tags: ['whole grain'],
    provenance: 'legacy_catalog_lookup',
    evidenceToken: 'catalog@2026-09-12',
    perServing: {
      calories: 150,
      protein_g: 5,
      fiber_g: 4,
      added_sugar_g: null,
      omega3_g: null,
      omega6_g: null,
      micronutrients: { ...emptyMicronutrients(), iron_mg: 1.8, magnesium_mg: 60 },
    },
    processingClass: 'whole',
    processingClassOverride: null,
    ...overrides,
  };
}

function evidenceMap(...items: ConsumedFoodEvidence[]): Map<string, ConsumedFoodEvidence> {
  return new Map(items.map((item) => [item.foodObjectId, item]));
}

// ---------------------------------------------------------------------------

describe('normalizeConsumedEntry — non-consumption rows', () => {
  it('refuses to normalize entry types that are not consumption', () => {
    for (const entryType of ['water', 'mood', 'note', 'supplement']) {
      expect(normalizeConsumedEntry(row({ entry_type: entryType }))).toBeNull();
    }
  });
});

describe('normalizeConsumedEntry — legacy flat foods', () => {
  it('multiplies per-serving values by the serving multiplier', () => {
    const normalized = normalizeConsumedEntry(
      row({
        payload: { name: 'Greek yogurt', quantity: 2, calories: 100, macros: { protein: 10 } },
      }),
    );

    expect(normalized?.shape).toBe('flat_food');
    expect(normalized?.quantityBasis.kind).toBe('per_serving_times_quantity');
    expect(normalized?.quantityBasis.appliedMultiplier).toBe(2);
    expect(normalized?.calories).toMatchObject({ value: 200, availability: 'known' });
    expect(normalized?.protein_g).toMatchObject({ value: 20, availability: 'known' });
  });

  it('handles fractional servings without inventing precision', () => {
    const normalized = normalizeConsumedEntry(
      row({ payload: { name: 'Toast', quantity: 0.5, calories: 90, macros: { protein: 4 } } }),
    );

    expect(normalized?.calories.value).toBe(45);
    expect(normalized?.protein_g.value).toBe(2);
  });

  it('keeps a known zero distinct from an unknown value', () => {
    const normalized = normalizeConsumedEntry(
      row({ payload: { name: 'Black coffee', quantity: 1, calories: 0 } }),
    );

    expect(normalized?.calories).toMatchObject({ value: 0, availability: 'known' });
    expect(normalized?.protein_g).toMatchObject({ value: null, availability: 'unknown' });
  });

  it('reports unknown energy instead of scoring a missing value as zero', () => {
    const normalized = normalizeConsumedEntry(row({ payload: { name: 'Mystery dish', quantity: 1 } }));

    expect(normalized?.calories.availability).toBe('unknown');
    expect(normalized?.calories.value).toBeNull();
  });

  it('uses the canonical grams basis rather than multiplying grams as servings', () => {
    // A pre-normalization legacy row: unit 'g' with a raw gram count in quantity.
    const normalized = normalizeConsumedEntry(
      row({
        payload: { name: 'Almonds', quantity: 84, unit: 'g', calories: 170, servingSizeG: 28 },
        quantity_g: 84,
      }),
    );

    expect(normalized?.quantityBasis.appliedMultiplier).toBe(3);
    expect(normalized?.calories.value).toBe(510);
    expect(normalized?.quantityBasis.consumedGrams).toBe(84);
    expect(normalized?.issues.map((i) => i.code)).toContain('grams_not_convertible');
  });

  it('leaves an already-normalized gram-mode row untouched', () => {
    // Written through lib/units/convert.ts: quantity is already the serving
    // multiplier and quantity_g holds the grams.
    const normalized = normalizeConsumedEntry(
      row({
        payload: { name: 'Almonds', quantity: 3, unit: 'g', calories: 170, servingSizeG: 28 },
        quantity_g: 84,
      }),
    );

    expect(normalized?.quantityBasis.appliedMultiplier).toBe(3);
    expect(normalized?.calories.value).toBe(510);
    expect(normalized?.issues.map((i) => i.code)).not.toContain('grams_not_convertible');
  });

  it('carries fiber and micronutrient evidence from the food reference at the logged amount', () => {
    const normalized = normalizeConsumedEntry(
      row({
        payload: { name: 'Oats', quantity: 2, calories: 150, macros: { protein: 5 }, foodObjectId: 'food-1' },
      }),
      { foodEvidence: evidenceMap(evidence()) },
    );

    expect(normalized?.fiber_g).toMatchObject({ value: 8, availability: 'known' });
    expect(normalized?.components).toHaveLength(1);
    expect(normalized?.components[0].micronutrients.iron_mg).toBe(3.6);
    expect(normalized?.components[0].processingClass).toBe('whole');
    expect(normalized?.components[0].provenance).toBe('legacy_catalog_lookup');
  });

  it('labels a legacy catalog dependency instead of calling it an at-log snapshot', () => {
    const normalized = normalizeConsumedEntry(
      row({ payload: { name: 'Oats', quantity: 1, calories: 150, foodObjectId: 'food-1' } }),
      { foodEvidence: evidenceMap(evidence()) },
    );

    expect(normalized?.components[0].provenance).toBe('legacy_catalog_lookup');
    expect(normalized?.components[0].evidenceToken).toBe('catalog@2026-09-12');
  });

  it('keeps an unresolvable food reference honest rather than inventing nutrition', () => {
    const normalized = normalizeConsumedEntry(
      row({ payload: { name: 'Oats', quantity: 1, calories: 150, foodObjectId: 'food-missing' } }),
      { foodEvidence: evidenceMap(evidence()) },
    );

    expect(normalized?.issues.map((i) => i.code)).toContain('food_reference_unresolved');
    expect(normalized?.fiber_g.availability).toBe('unknown');
    expect(normalized?.components[0].micronutrients.iron_mg).toBeNull();
  });

  it('never treats total sugar as added sugar and never assumes a zero', () => {
    const normalized = normalizeConsumedEntry(
      row({
        payload: { name: 'Soda', quantity: 1, calories: 140, foodObjectId: 'food-1' },
      }),
      // The catalog carries total sugar only; added sugar remains unknown.
      { foodEvidence: evidenceMap(evidence({ perServing: { ...evidence().perServing, added_sugar_g: null } })) },
    );

    expect(normalized?.added_sugar_g).toMatchObject({ value: null, availability: 'unknown' });
    expect(normalized?.issues.map((i) => i.code)).toContain('added_sugar_unknown');
  });

  it('sums a known added sugar, including a genuine zero', () => {
    const withZero = normalizeConsumedEntry(
      row({ payload: { name: 'Oats', quantity: 2, calories: 150, foodObjectId: 'food-1' } }),
      { foodEvidence: evidenceMap(evidence({ perServing: { ...evidence().perServing, added_sugar_g: 0 } })) },
    );
    expect(withZero?.added_sugar_g).toMatchObject({ value: 0, availability: 'known' });

    const withPositive = normalizeConsumedEntry(
      row({ payload: { name: 'Granola', quantity: 2, calories: 200, foodObjectId: 'food-1' } }),
      { foodEvidence: evidenceMap(evidence({ perServing: { ...evidence().perServing, added_sugar_g: 5 } })) },
    );
    expect(withPositive?.added_sugar_g).toMatchObject({ value: 10, availability: 'known' });
  });

  it('reports a food reference whose energy disagrees with the logged amount', () => {
    const normalized = normalizeConsumedEntry(
      row({ payload: { name: 'Oats', quantity: 1, calories: 600, foodObjectId: 'food-1' } }),
      { foodEvidence: evidenceMap(evidence()) },
    );

    expect(normalized?.issues.map((i) => i.code)).toContain('parent_component_calorie_mismatch');
    // The logged figure wins so quality subscores share the Log's interpretation.
    expect(normalized?.components[0].calories).toBe(600);
  });
});

describe('normalizeConsumedEntry — grouped meals from the real builder', () => {
  it('counts already-consumed totals exactly once at multiple servings', () => {
    const payload = buildGroupedMealIntakePayload(mealDocument(), { consumed_servings: 2 });

    // The builder records consumed totals at top level AND quantity = servings.
    expect(payload.calories).toBe(600);
    expect(payload.quantity).toBe(2);

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.shape).toBe('grouped_meal');
    expect(normalized?.quantityBasis.kind).toBe('already_consumed_total');
    expect(normalized?.quantityBasis.appliedMultiplier).toBe(1);
    // The audited defect produced 1200 here.
    expect(normalized?.calories.value).toBe(600);
    expect(normalized?.protein_g.value).toBe(40);
  });

  it('does not deflate a fractional grouped serving', () => {
    const payload = buildGroupedMealIntakePayload(mealDocument(), { consumed_servings: 0.5 });
    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(payload.calories).toBe(150);
    expect(normalized?.calories.value).toBe(150);
  });

  it('falls back to meal_group.totals when the top-level mirror is absent', () => {
    const payload = buildGroupedMealIntakePayload(mealDocument(), { consumed_servings: 1 });
    const withoutMirror = { ...payload } as Record<string, unknown>;
    delete withoutMirror.calories;
    delete withoutMirror.macros;

    const normalized = normalizeConsumedEntry(row({ payload: withoutMirror }));

    expect(normalized?.calories.value).toBe(300);
    expect(normalized?.protein_g.value).toBe(20);
  });

  it('reports missing grouped totals instead of scoring a zero', () => {
    const payload = buildGroupedMealIntakePayload(
      mealDocument({ per_serving: null, totals: null, nutrition_status: 'unavailable' }),
      { consumed_servings: 1 },
    );
    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.calories.availability).toBe('unknown');
    expect(normalized?.issues.map((i) => i.code)).toContain('grouped_totals_missing');
  });

  it('traverses components and preserves ingredient identity', () => {
    const payload = buildGroupedMealIntakePayload(
      mealDocument({
        components: [
          component({ component_id: 'c1', name: 'Black beans', food_object_id: 'food-1' }),
          component({ component_id: 'c2', name: 'Brown rice', calories: 200, food_object_id: null }),
        ],
      }),
      { consumed_servings: 1 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }), {
      foodEvidence: evidenceMap(evidence()),
    });

    expect(normalized?.components.map((c) => c.name)).toEqual(['Black beans', 'Brown rice']);
    expect(normalized?.componentsAreSubsetOfParentTotals).toBe(true);
    // Ingredient-level processing evidence survives, which the audited path lost.
    expect(normalized?.components[0].processingClass).toBe('whole');
  });

  it('divides recipe components by yield and scales to the servings eaten', () => {
    // A recipe batch of 4 servings; the components describe the whole batch.
    const payload = buildGroupedMealIntakePayload(
      mealDocument({
        kind: 'recipe',
        recipe_yield_servings: 4,
        components: [component({ calories: 400, macros: { protein_g: 28, carbs_g: 80, fat_g: 2, fiber_g: 24, added_sugar_g: 0 } })],
        per_serving: { calories: 100, macros: { protein_g: 7, carbs_g: 20, fat_g: 0.5, fiber_g: 6, added_sugar_g: 0 } },
        totals: { calories: 400, macros: { protein_g: 28, carbs_g: 80, fat_g: 2, fiber_g: 24, added_sugar_g: 0 } },
      }),
      { consumed_servings: 2 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    // 2 of 4 servings ⇒ half the batch.
    expect(normalized?.components[0].appliedMultiplier).toBe(0.5);
    expect(normalized?.components[0].calories).toBe(200);
    expect(normalized?.calories.value).toBe(200);
  });

  it('respects a per_serving component basis instead of assuming the parent basis', () => {
    const perServingChild = component({
      nutrition_basis: 'per_serving' as MealNutritionBasis,
      quantity: 2,
      unit: 'serving',
      calories: 50,
      macros: { protein_g: 3, carbs_g: 8, fat_g: 1, fiber_g: 2, added_sugar_g: 0 },
    });

    const payload = buildGroupedMealIntakePayload(
      mealDocument({ components: [perServingChild] }),
      { consumed_servings: 1 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    // 2 servings of the child at 50 kcal each.
    expect(normalized?.components[0].appliedMultiplier).toBe(2);
    expect(normalized?.components[0].calories).toBe(100);
  });

  it('flags a component whose declared basis cannot be converted', () => {
    const unscalable = component({
      nutrition_basis: 'per_serving' as MealNutritionBasis,
      quantity: 1,
      unit: 'handful',
      measures: [],
      serving_size_g: null,
    });

    const payload = buildGroupedMealIntakePayload(
      mealDocument({ components: [unscalable] }),
      { consumed_servings: 1 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.issues.map((i) => i.code)).toContain('component_quantity_basis_unknown');
  });

  it('uses a recipe-reference snapshot and never resolves today’s mutable recipe', () => {
    const reference = component({
      component_id: 'ref-1',
      name: 'House marinara',
      component_kind: 'recipe_document',
      recipe_meal_document_id: 'recipe-9',
      recipe_version_token: 'v7',
      quantity: 2,
      nutrition_basis: 'per_component' as MealNutritionBasis,
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_snapshot: {
        per_serving: { calories: 80, macros: { protein_g: 2, carbs_g: 12, fat_g: 3, fiber_g: 3, added_sugar_g: 1 } },
        status: 'available',
      },
    });

    const payload = buildGroupedMealIntakePayload(
      mealDocument({ components: [reference] }),
      { consumed_servings: 1 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.components[0].provenance).toBe('recipe_reference_snapshot');
    expect(normalized?.components[0].evidenceToken).toBe('v7');
    // Snapshot is per serving of the referenced recipe; quantity 2 ⇒ 160 kcal.
    expect(normalized?.components[0].calories).toBe(160);
    expect(normalized?.components[0].added_sugar_g).toBe(2);
  });

  it('leaves a missing recipe snapshot missing', () => {
    const reference = component({
      component_id: 'ref-1',
      name: 'House marinara',
      component_kind: 'recipe_document',
      recipe_meal_document_id: 'recipe-9',
      recipe_version_token: 'v7',
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_snapshot: null,
    });

    const payload = buildGroupedMealIntakePayload(
      mealDocument({ components: [reference] }),
      { consumed_servings: 1 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.issues.map((i) => i.code)).toContain('recipe_reference_snapshot_missing');
    expect(normalized?.components[0].calories).toBeNull();
    expect(normalized?.components[0].provenance).toBe('unresolved');
  });

  it('treats a known subtotal plus an unknown contributor as partial, not a total', () => {
    const known = component({ component_id: 'c1', macros: { protein_g: 7, carbs_g: 20, fat_g: 1, fiber_g: 6, added_sugar_g: 4 } });
    const unknown = component({ component_id: 'c2', macros: { protein_g: 5, carbs_g: 10, fat_g: 2 } });

    const payload = buildGroupedMealIntakePayload(
      mealDocument({
        components: [known, unknown],
        per_serving: { calories: 300, macros: { protein_g: 20, carbs_g: 40, fat_g: 6 } },
        totals: { calories: 300, macros: { protein_g: 20, carbs_g: 40, fat_g: 6 } },
      }),
      { consumed_servings: 1 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.added_sugar_g.availability).toBe('partial');
    expect(normalized?.added_sugar_g.value).toBe(4);
    expect(normalized?.added_sugar_g.unknownContributorCount).toBe(1);
  });

  it('surfaces a parent/component mismatch without proportional reconciliation', () => {
    const payload = buildGroupedMealIntakePayload(
      mealDocument({ components: [component({ calories: 100 })] }),
      { consumed_servings: 1 },
    );

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.parentComponentConsistency).toBe('mismatch');
    expect(normalized?.calories.value).toBe(300);
    expect(normalized?.components[0].calories).toBe(100);
  });

  it('does not let a malformed group become a valid flat food', () => {
    const normalized = normalizeConsumedEntry(
      row({ payload: { name: 'Broken bowl', quantity: 2, calories: 600, meal_group: { name: 'x' } } }),
    );

    expect(normalized?.shape).toBe('malformed_group');
    expect(normalized?.issues.map((i) => i.code)).toContain('malformed_meal_group');
    // Already-consumed totals are still counted once, not multiplied by 2.
    expect(normalized?.calories.value).toBe(600);
  });
});

describe('normalizeConsumedEntry — planned execution parity', () => {
  function samplePlanned(): PlannedMeal {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: 'slot-1',
      person_id: 'person-1',
      name: 'Planned oats',
      meal_type: 'breakfast',
      payload: {
        totals: { calories: 420, protein_g: 18, carbs_g: 55, fat_g: 12 },
        items: [
          { name: 'Rolled oats', quantity: 1, unit: 'cup', calories: 300, macros: { protein: 10, carbs: 40, fat: 6 } },
          { name: 'Berries', quantity: 0.5, unit: 'cup', calories: 120, macros: { protein: 2, carbs: 15, fat: 1 } },
        ],
      },
      protein_score_10: 7,
      is_main_meal: true,
      psq_multiplier: 1,
      meal_derived_data: {},
      nds_confidence: 'high',
      source_template_id: 'tmpl-1',
      source_imported_meal_id: null,
      reusable_provenance: null,
      nds_version: '1',
      classifier_version: '1',
      execution_state: 'pending',
      journal_entry_id: null,
      created_at: '',
      updated_at: '',
    };
  }

  it('normalizes an exactly-as-planned meal to its consumed totals, counted once', () => {
    const payload = buildExactPlannedMealIntakePayload(samplePlanned(), { consumed_servings: 2 });

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(normalized?.shape).toBe('grouped_meal');
    expect(normalized?.quantityBasis.kind).toBe('already_consumed_total');
    expect(normalized?.quantityBasis.appliedMultiplier).toBe(1);
    // The builder already scaled 420 kcal by 2 servings; it must not become 1680.
    expect(payload.calories).toBe(840);
    expect(normalized?.calories.value).toBe(840);
    expect(normalized?.components).toHaveLength(2);
  });

  it('normalizes adjusted consumption from the edited document snapshot', () => {
    const payload = buildAdjustedPlannedMealIntakePayload(mealDocument(), { consumed_servings: 1 });

    const normalized = normalizeConsumedEntry(row({ payload: payload as Record<string, unknown> }));

    expect(payload.logged_as_planned).toBe(false);
    expect(normalized?.calories.value).toBe(300);
  });

  it('keeps the consumed snapshot stable when the reusable source is edited afterwards', () => {
    const source = mealDocument();
    const payload = buildGroupedMealIntakePayload(source, { consumed_servings: 1 });
    const loggedRow = row({ payload: payload as Record<string, unknown> });

    const before = normalizeConsumedEntry(loggedRow);

    // Edit the reusable source after the fact.
    source.title = 'Renamed Bowl';
    source.per_serving = { calories: 9000, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } };
    source.components[0].calories = 8000;

    const after = normalizeConsumedEntry(loggedRow);

    expect(after?.calories.value).toBe(before?.calories.value);
    expect(after?.calories.value).toBe(300);
    expect(after?.displayName).toBe('Bean Bowl');
  });
});

describe('normalizeConsumedDay', () => {
  const chicagoMetadata = buildConsumedDayMetadata(
    new Date('2026-09-13T02:30:00.000Z'),
    'America/Chicago',
  );

  it('attributes an entry to the local day its own metadata records', () => {
    // 02:30 UTC on the 13th is 21:30 on the 12th in Chicago.
    expect(chicagoMetadata?.date_local).toBe('2026-09-12');

    const day = normalizeConsumedDay('person-1', '2026-09-12', [
      row({
        occurred_at: '2026-09-13T02:30:00.000Z',
        payload: { name: 'Late dinner', quantity: 1, calories: 500, consumed_day: chicagoMetadata },
      }),
    ]);

    expect(day.entries).toHaveLength(1);
    expect(day.entries[0].dayAttribution.provenance).toBe('explicit');
    expect(day.normalizerVersion).toBe(NDS_NORMALIZER_VERSION);
  });

  it('excludes an entry that belongs to an adjacent day', () => {
    const day = normalizeConsumedDay('person-1', '2026-09-13', [
      row({
        occurred_at: '2026-09-13T02:30:00.000Z',
        payload: { name: 'Late dinner', quantity: 1, calories: 500, consumed_day: chicagoMetadata },
      }),
    ]);

    expect(day.entries).toHaveLength(0);
  });

  it('buckets a metadata-less row deterministically and labels it legacy', () => {
    const day = normalizeConsumedDay('person-1', '2026-09-13', [
      row({ occurred_at: '2026-09-13T02:30:00.000Z', payload: { name: 'Legacy', quantity: 1, calories: 500 } }),
    ]);

    expect(day.entries).toHaveLength(1);
    expect(day.entries[0].dayAttribution.provenance).toBe('legacy_unverified');
    expect(day.entries[0].dayAttribution.timeZone).toBeNull();
  });
});
