/**
 * NDS-01 checkpoint A — consumed day to block-level meals.
 *
 * Asserts the protected boundaries: three preserved scoring blocks, entry-level
 * isolated-snack eligibility, no double counting between parent totals and
 * component evidence, and honest added-sugar coverage.
 */

import { buildDailyMealsFromConsumedDay } from '../toDailyMeals';
import { normalizeConsumedDay, type ConsumedEntryRow } from '../normalizeConsumedEntry';
import { emptyMicronutrients, type ConsumedFoodEvidence } from '../types';
import { buildConsumedDayMetadata, NDS_DAY_POLICY_VERSION } from '../../dayIdentity';
import { buildGroupedMealIntakePayload } from '@/lib/meals/groupedMealPayload';
import type { MealComponent, MealDocument } from '@/lib/meals/types';

const ZONE = 'America/Chicago';
const DAY = '2026-09-12';

/** UTC instant for a local wall-clock hour in the test zone (UTC-5 in September). */
function atLocalHour(hour: number, minute = 0): string {
  const utcHour = hour + 5;
  const dayOffset = Math.floor(utcHour / 24);
  const wrapped = utcHour % 24;
  const date = 12 + dayOffset;
  return `2026-09-${String(date).padStart(2, '0')}T${String(wrapped).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function flatRow(
  id: string,
  localHour: number,
  payload: Record<string, unknown>,
  minute = 0,
): ConsumedEntryRow {
  const occurredAt = atLocalHour(localHour, minute);
  return {
    id,
    person_id: 'person-1',
    entry_type: 'intake',
    occurred_at: occurredAt,
    payload: {
      ...payload,
      consumed_day: buildConsumedDayMetadata(new Date(occurredAt), ZONE),
    },
    quantity_g: null,
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
      micronutrients: { ...emptyMicronutrients(), iron_mg: 1.8 },
    },
    processingClass: 'whole',
    processingClassOverride: null,
    ...overrides,
  };
}

function build(rows: ConsumedEntryRow[], foodEvidence?: Map<string, ConsumedFoodEvidence>) {
  const day = normalizeConsumedDay('person-1', DAY, rows, { foodEvidence });
  return buildDailyMealsFromConsumedDay(day, { totalEntryCount: rows.length });
}

describe('block grouping', () => {
  it('groups entries into the three preserved scoring blocks', () => {
    const result = build([
      flatRow('e1', 8, { name: 'Oats', quantity: 1, calories: 400 }),
      flatRow('e2', 13, { name: 'Salad', quantity: 1, calories: 500 }),
      flatRow('e3', 19, { name: 'Salmon', quantity: 1, calories: 600 }),
    ]);

    expect(result.meals.map((m) => m.id).sort()).toEqual([
      'block-evening',
      'block-midday',
      'block-morning',
    ]);
    expect(result.diagnostics.mealCount).toBe(3);
  });

  it('combines several entries in one block into a single meal', () => {
    const result = build([
      flatRow('e1', 12, { name: 'Salmon', quantity: 1, calories: 300, macros: { protein: 30 } }),
      flatRow('e2', 12, { name: 'Quinoa', quantity: 1, calories: 220, macros: { protein: 8 } }, 30),
    ]);

    expect(result.meals).toHaveLength(1);
    expect(result.meals[0].calories).toBe(520);
    expect(result.meals[0].protein_g).toBe(38);
    expect(result.meals[0].is_main_meal).toBe(true);
  });

  it('uses each entry’s recorded zone rather than the process timezone', () => {
    // 03:00 UTC on the 13th is 22:00 on the 12th in Chicago: evening block.
    const occurredAt = '2026-09-13T03:00:00.000Z';
    const result = build([
      {
        id: 'e1',
        person_id: 'person-1',
        entry_type: 'intake',
        occurred_at: occurredAt,
        payload: {
          name: 'Late dinner',
          quantity: 1,
          calories: 700,
          consumed_day: buildConsumedDayMetadata(new Date(occurredAt), ZONE),
        },
        quantity_g: null,
      },
    ]);

    expect(result.meals[0].id).toBe('block-evening');
    expect(result.diagnostics.dayProvenance).toBe('explicit');
  });
});

describe('isolated-snack eligibility', () => {
  it('excludes an isolated sub-threshold entry', () => {
    const result = build([flatRow('e1', 15, { name: 'Handful of nuts', quantity: 1, calories: 150 })]);

    expect(result.meals).toHaveLength(0);
    expect(result.diagnostics.entriesExcludedAsIsolatedSnacks).toBe(1);
    expect(result.diagnostics.eligibleEntryCount).toBe(0);
  });

  it('keeps a sub-threshold entry that sits inside a meal window', () => {
    const result = build([
      flatRow('e1', 12, { name: 'Salad', quantity: 1, calories: 400 }),
      flatRow('e2', 12, { name: 'Nuts', quantity: 1, calories: 150 }, 45),
    ]);

    expect(result.diagnostics.entriesExcludedAsIsolatedSnacks).toBe(0);
    expect(result.meals[0].calories).toBe(550);
  });

  it('counts EXCLUDED ENTRIES, not ingredients subtracted from entry counts', () => {
    // One grouped meal with three ingredients, plus one isolated snack.
    const grouped = buildGroupedMealIntakePayload(
      mealDocument({
        components: [
          component({ component_id: 'c1' }),
          component({ component_id: 'c2' }),
          component({ component_id: 'c3' }),
        ],
      }),
      { consumed_servings: 1 },
    );

    const result = build([
      flatRow('e1', 12, grouped as unknown as Record<string, unknown>),
      flatRow('e2', 21, { name: 'Isolated mint', quantity: 1, calories: 20 }),
    ]);

    expect(result.diagnostics.intakeCount).toBe(2);
    expect(result.diagnostics.entriesExcludedAsIsolatedSnacks).toBe(1);
    expect(result.diagnostics.eligibleEntryCount).toBe(1);
    // The old diagnostic subtracted ingredient counts from entry counts and
    // could report a negative or nonsensical exclusion figure.
    expect(result.diagnostics.entriesExcludedAsIsolatedSnacks).toBeGreaterThanOrEqual(0);
  });

  it('applies eligibility before component expansion', () => {
    // A grouped meal below the snack threshold with many ingredients is still
    // judged as ONE entry.
    const grouped = buildGroupedMealIntakePayload(
      mealDocument({
        components: [component({ component_id: 'c1' }), component({ component_id: 'c2' })],
        per_serving: { calories: 90, macros: { protein_g: 3, carbs_g: 10, fat_g: 1 } },
        totals: { calories: 90, macros: { protein_g: 3, carbs_g: 10, fat_g: 1 } },
      }),
      { consumed_servings: 1 },
    );

    const result = build([flatRow('e1', 21, grouped as unknown as Record<string, unknown>)]);

    expect(result.diagnostics.entriesExcludedAsIsolatedSnacks).toBe(1);
    expect(result.meals).toHaveLength(0);
  });

  it('does not judge an entry with unknown energy against a calorie threshold', () => {
    const result = build([flatRow('e1', 15, { name: 'Unknown dish', quantity: 1 })]);

    expect(result.diagnostics.entriesExcludedAsIsolatedSnacks).toBe(0);
    expect(result.diagnostics.eligibleEntryCount).toBe(1);
    expect(result.coverage.calories).toBe('unknown');
    expect(result.coverage.entriesMissingCalories).toBe(1);
  });
});

describe('no double counting', () => {
  it('takes quantity from the parent total and quality from the components', () => {
    const grouped = buildGroupedMealIntakePayload(
      mealDocument({
        components: [
          component({ component_id: 'c1', name: 'Beans', calories: 150, food_object_id: 'food-1' }),
          component({ component_id: 'c2', name: 'Rice', calories: 150, food_object_id: null }),
        ],
      }),
      { consumed_servings: 1 },
    );

    const result = build(
      [flatRow('e1', 12, grouped as unknown as Record<string, unknown>)],
      new Map([['food-1', evidence()]]),
    );

    // Parent declares 300 consumed kcal; the block total is 300, not 600.
    expect(result.meals[0].calories).toBe(300);
    // Both ingredients still contribute quality evidence.
    expect(result.meals[0].foods.map((f) => f.canonicalName)).toEqual(['Beans', 'Rice']);
    expect(result.meals[0].foods[0].processingClass).toBe('whole');
  });

  it('does not multiply already-consumed grouped totals by servings', () => {
    const grouped = buildGroupedMealIntakePayload(mealDocument(), { consumed_servings: 2 });
    const result = build([flatRow('e1', 12, grouped as unknown as Record<string, unknown>)]);

    // The audited defect produced 1200 kcal here.
    expect(result.meals[0].calories).toBe(600);
  });

  it('keeps a food-object entry represented once', () => {
    const result = build(
      [flatRow('e1', 8, { name: 'Oats', quantity: 2, calories: 150, foodObjectId: 'food-1' })],
      new Map([['food-1', evidence()]]),
    );

    expect(result.meals[0].calories).toBe(300);
    expect(result.meals[0].foods).toHaveLength(1);
    expect(result.meals[0].foods[0].calories).toBe(300);
  });
});

describe('added sugar coverage', () => {
  it('never hands the calculator a fabricated zero', () => {
    const result = build(
      [flatRow('e1', 8, { name: 'Oats', quantity: 1, calories: 400, foodObjectId: 'food-1' })],
      new Map([['food-1', evidence()]]),
    );

    expect(result.coverage.addedSugar).toBe('unknown');
    expect(result.coverage.entriesMissingAddedSugar).toBe(1);
    // Absent, not zero: the resolver decides what an incomplete day may claim.
    expect(result.meals[0].added_sugar_g).toBeUndefined();
  });

  it('passes a genuinely known zero through as a measurement', () => {
    const result = build(
      [flatRow('e1', 8, { name: 'Oats', quantity: 1, calories: 400, foodObjectId: 'food-1' })],
      new Map([
        ['food-1', evidence({ perServing: { ...evidence().perServing, added_sugar_g: 0 } })],
      ]),
    );

    expect(result.coverage.addedSugar).toBe('known');
    expect(result.meals[0].added_sugar_g).toBe(0);
  });

  it('sums a positive known added sugar across a block', () => {
    const result = build(
      [
        flatRow('e1', 8, { name: 'Granola', quantity: 2, calories: 200, foodObjectId: 'food-1' }),
        flatRow('e2', 9, { name: 'Granola', quantity: 1, calories: 100, foodObjectId: 'food-1' }),
      ],
      new Map([
        ['food-1', evidence({ perServing: { ...evidence().perServing, added_sugar_g: 3 } })],
      ]),
    );

    expect(result.coverage.addedSugar).toBe('known');
    expect(result.meals[0].added_sugar_g).toBe(9);
  });

  it('reports partial coverage when only some entries know their added sugar', () => {
    const result = build(
      [
        flatRow('e1', 8, { name: 'Granola', quantity: 1, calories: 300, foodObjectId: 'food-1' }),
        flatRow('e2', 13, { name: 'Mystery lunch', quantity: 1, calories: 500 }),
      ],
      new Map([
        ['food-1', evidence({ perServing: { ...evidence().perServing, added_sugar_g: 3 } })],
      ]),
    );

    expect(result.coverage.addedSugar).toBe('partial');
    expect(result.coverage.entriesMissingAddedSugar).toBe(1);
  });
});

describe('diagnostics', () => {
  it('reports an empty day distinctly from a fully excluded day', () => {
    const empty = build([]);
    expect(empty.diagnostics.intakeCount).toBe(0);
    expect(empty.diagnostics.entriesExcludedAsIsolatedSnacks).toBe(0);
    expect(empty.diagnostics.dayProvenance).toBe('empty');

    const allExcluded = build([flatRow('e1', 15, { name: 'Mint', quantity: 1, calories: 10 })]);
    expect(allExcluded.diagnostics.intakeCount).toBe(1);
    expect(allExcluded.diagnostics.entriesExcludedAsIsolatedSnacks).toBe(1);
    expect(allExcluded.meals).toHaveLength(0);
  });

  it('reports malformed groups, mismatches, and unresolved components', () => {
    const result = build([
      flatRow('e1', 12, { name: 'Broken', quantity: 1, calories: 400, meal_group: { name: 'x' } }),
      flatRow('e2', 13, {
        name: 'Mismatched',
        quantity: 1,
        calories: 500,
        meal_group: {
          schema_version: 1,
          name: 'Mismatched',
          components: [
            { component_id: 'c1', name: 'Thing', quantity: 1, unit: 'serving', food_object_id: null, calories: 50, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 }, nutrition_basis: 'per_component', match_status: 'matched', source_kind: 'user_entered', needs_review: false },
          ],
          totals: { calories: 500, macros: { protein_g: 10, carbs_g: 10, fat_g: 10 } },
          planned_servings: null,
          consumed_servings: 1,
          detached_from_source: false,
          needs_review: false,
          source_meal_document_id: null,
          source_imported_meal_id: null,
          source_planned_meal_id: null,
          source_template_id: null,
        },
      }),
    ]);

    expect(result.diagnostics.malformedGroupCount).toBe(1);
    expect(result.diagnostics.parentComponentMismatchCount).toBe(1);
  });

  it('labels a day whose entries mix explicit and legacy provenance', () => {
    const explicit = flatRow('e1', 8, { name: 'Oats', quantity: 1, calories: 400 });
    const legacy: ConsumedEntryRow = {
      id: 'e2',
      person_id: 'person-1',
      entry_type: 'intake',
      occurred_at: '2026-09-12T18:00:00.000Z',
      payload: { name: 'Legacy lunch', quantity: 1, calories: 500 },
      quantity_g: null,
    };

    const result = build([explicit, legacy]);

    expect(result.diagnostics.dayProvenance).toBe('mixed');
    expect(result.diagnostics.entriesWithLegacyDayProvenance).toBe(1);
  });

  it('records the day policy version alongside the attribution', () => {
    const result = build([flatRow('e1', 8, { name: 'Oats', quantity: 1, calories: 400 })]);
    expect(result.diagnostics.dayProvenance).toBe('explicit');
    expect(NDS_DAY_POLICY_VERSION).toMatch(/^nds_day_policy_/);
  });
});

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
