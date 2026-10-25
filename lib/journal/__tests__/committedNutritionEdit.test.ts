import { describe, expect, it } from '@jest/globals';
import {
  buildCommittedSingleItemPayload,
  convertCommittedSingleItemQuantity,
  preservedCommittedReplacementAmount,
} from '../committedNutritionEdit';
import {
  attachConsumedNutritionEvidence,
  NDS_CONSUMED_EVIDENCE_VERSION,
  type ConsumedNutritionEvidence,
} from '@/lib/nds/consumedEvidence';
import type { LogNutritionSingleItemDraftEntryV1 } from '@/lib/logDraft/logNutritionDraft';
import { computeQuantities } from '@/lib/units/convert';

const replacement: LogNutritionSingleItemDraftEntryV1 = {
  id: 'replacement',
  sourceKey: 'food:new-food',
  kind: 'single_item',
  title: 'New Food',
  quantity: 1,
  unit: 'cup',
  calories: 120,
  macros: { protein: 8, carbs: null, fat: 3 },
  foodObjectId: 'new-food',
  servingSizeG: 200,
  measures: [{ unit: 'cup', grams: 200 }],
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
};

describe('Packet 15 committed Single Item payload replacement', () => {
  it('replaces identity, nutrition, and serving basis without stale old fields', () => {
    const result = buildCommittedSingleItemPayload({
      current: {
        name: 'Old Food',
        quantity: 4,
        unit: 'tbsp',
        calories: 999,
        macros: { protein: 99, carbs: 88, fat: 77 },
        foodObjectId: 'old-food',
        servingSizeG: 15,
        measures: [{ unit: 'tbsp', grams: 15 }],
        source_planned_meal_id: 'c923c506-8218-40c5-9047-aa111f540f2e',
      },
      replacement,
      quantity: 0.5,
      unit: 'cup',
    });

    expect(result).toEqual({
      name: 'New Food',
      quantity: 0.5,
      unit: 'cup',
      calories: 120,
      macros: { protein: 8, fat: 3 },
      foodObjectId: 'new-food',
      foodSourceKey: 'food:new-food',
      servingSizeG: 200,
      measures: [{ unit: 'cup', grams: 200 }],
      source_planned_meal_id: 'c923c506-8218-40c5-9047-aa111f540f2e',
    });
  });

  it('keeps unknown nutrients absent rather than manufacturing zero', () => {
    const result = buildCommittedSingleItemPayload({
      current: { name: 'Old', calories: 50, macros: { carbs: 10 } },
      replacement: { ...replacement, calories: null, macros: {
        protein: null,
        carbs: null,
        fat: null,
      } },
      quantity: 1,
      unit: 'cup',
    });
    expect(result.calories).toBeUndefined();
    expect(result.macros).toBeUndefined();
  });

  it('preserves per-serving fiber and authored added sugar for quantity-only edits', () => {
    const result = buildCommittedSingleItemPayload({
      current: {
        name: 'Oats',
        quantity: 1,
        unit: 'serving',
        calories: 100,
        macros: {
          protein: 10,
          carbs: 20,
          fat: 2,
          fiber_g: 4,
          added_sugar_g: 5,
          added_sugar_provenance: 'authored',
        },
        added_sugar_provenance: 'authored',
        nutrition_basis: 'per_serving',
      },
      quantity: 2,
      unit: 'serving',
    });

    expect(result.quantity).toBe(2);
    expect(result.nutrition_basis).toBe('per_serving');
    expect(result.macros).toEqual({
      protein: 10,
      carbs: 20,
      fat: 2,
      fiber_g: 4,
      added_sugar_g: 5,
      added_sugar_provenance: 'authored',
    });
    expect(result.added_sugar_provenance).toBe('authored');
    // The payload remains per serving. Quantity is the single multiplier.
    expect((result.macros?.fiber_g ?? 0) * (result.quantity ?? 0)).toBe(8);
    expect((result.macros?.added_sugar_g ?? 0) * (result.quantity ?? 0)).toBe(10);
  });

  it('preserves explicit zero while leaving missing and unknown nutrients unknown', () => {
    const zero = buildCommittedSingleItemPayload({
      current: {
        name: 'Plain Food',
        macros: {
          fiber_g: 0,
          added_sugar_g: 0,
          added_sugar_provenance: 'authored',
        },
        quantity: 1,
        unit: 'serving',
      },
      quantity: 2,
      unit: 'serving',
    });
    expect(zero.macros?.fiber_g).toBe(0);
    expect(zero.macros?.added_sugar_g).toBe(0);
    expect(zero.macros?.added_sugar_provenance).toBe('authored');

    const unknown = buildCommittedSingleItemPayload({
      current: {
        name: 'Unknown Food',
        macros: {
          fiber_g: null as unknown as number,
          added_sugar_g: 9,
          added_sugar_provenance: 'unknown',
        },
        quantity: 1,
        unit: 'serving',
      },
      quantity: 2,
      unit: 'serving',
    });
    expect(unknown.macros).not.toHaveProperty('fiber_g');
    expect(unknown.macros).not.toHaveProperty('added_sugar_g');
    expect(unknown.macros?.added_sugar_provenance).toBe('unknown');

    const untrusted = buildCommittedSingleItemPayload({
      current: {
        name: 'Catalog Food',
        macros: {
          added_sugar_g: 12,
          added_sugar_provenance: 'untrusted_catalog_total_sugar',
        },
        quantity: 1,
        unit: 'serving',
      },
      quantity: 2,
      unit: 'serving',
    });
    expect(untrusted.macros).not.toHaveProperty('added_sugar_g');
    expect(untrusted.macros?.added_sugar_provenance).toBe('untrusted_catalog_total_sugar');
  });

  it('uses replacement fiber and removes stale nutrients and provenance from the old food', () => {
    const result = buildCommittedSingleItemPayload({
      current: {
        name: 'Old Food',
        quantity: 1,
        unit: 'serving',
        macros: {
          protein: 99,
          carbs: 88,
          fat: 77,
          fiber_g: 4,
          added_sugar_g: 5,
          added_sugar_provenance: 'authored',
        },
        added_sugar_provenance: 'authored',
      },
      replacement: {
        ...replacement,
        macros: { ...replacement.macros, fiber_g: 2 },
      },
      quantity: 2,
      unit: 'serving',
    });

    expect(result.macros).toEqual({ protein: 8, fat: 3, fiber_g: 2 });
    expect(result.macros).not.toHaveProperty('added_sugar_g');
    expect(result.macros).not.toHaveProperty('added_sugar_provenance');
    expect(result).not.toHaveProperty('added_sugar_provenance');
  });
});

describe('Packet 15B committed Single Item physical-amount conversion', () => {
  const basis = {
    servingSizeG: 100,
    measures: [{ unit: 'cup', grams: 200 }],
  };

  it.each([
    [100, 'g', 'serving', 1],
    [1, 'serving', 'g', 100],
    [50, 'g', 'serving', 0.5],
    [2, 'serving', 'g', 200],
  ])('converts %s %s to %s as %s', (quantity, fromUnit, toUnit, expected) => {
    expect(convertCommittedSingleItemQuantity({
      quantity,
      fromUnit,
      toUnit,
      ...basis,
    })).toEqual({ quantity: expected, unit: toUnit });
  });

  it('round-trips a canonical household measure without changing physical grams', () => {
    const cups = convertCommittedSingleItemQuantity({
      quantity: 100,
      fromUnit: 'g',
      toUnit: 'cup',
      ...basis,
    });
    expect(cups).toEqual({ quantity: 0.5, unit: 'cup' });
    expect(convertCommittedSingleItemQuantity({
      quantity: cups!.quantity,
      fromUnit: cups!.unit,
      toUnit: 'g',
      ...basis,
    })).toEqual({ quantity: 100, unit: 'g' });
  });

  it('returns null instead of falling back to one for an impossible conversion', () => {
    expect(convertCommittedSingleItemQuantity({
      quantity: 100,
      fromUnit: 'g',
      toUnit: 'serving',
      servingSizeG: null,
    })).toBeNull();
    expect(convertCommittedSingleItemQuantity({
      quantity: 1,
      fromUnit: 'cup',
      toUnit: 'tablespoon',
      servingSizeG: null,
      measures: [
        { unit: 'cup', grams: 200 },
        { unit: 'tablespoon', grams: 12.5 },
      ],
    })).toBeNull();
  });

  it('lets the server canonicalize a gram display request to serving multiplier + quantity_g', () => {
    const payload = buildCommittedSingleItemPayload({
      current: {
        name: 'Beans',
        quantity: 1,
        unit: 'serving',
        calories: 100,
        servingSizeG: 100,
      },
      quantity: 200,
      unit: 'g',
    });
    const canonical = computeQuantities(
      payload.unit,
      payload.quantity,
      payload.servingSizeG,
      payload.measures,
    );
    // The PATCH request carries the display amount; computeEntryQuantityG uses
    // this same canonical helper before persistence.
    expect(payload.quantity).toBe(200);
    expect(canonical.servingQty).toBe(2);
    expect(canonical.quantityG).toBe(200);
    expect((payload.calories ?? 0) * canonical.servingQty).toBe(200);
  });

  it('keeps 50 g when the replacement can express grams', () => {
    expect(
      preservedCommittedReplacementAmount({
        quantity: 50,
        unit: 'g',
        servingSizeG: 91,
        measures: [{ unit: 'cup', grams: 156 }],
      }),
    ).toEqual({ quantity: 50, unit: 'g' });
  });

  it('does not keep a cup the replacement cannot express', () => {
    expect(
      preservedCommittedReplacementAmount({
        quantity: 1,
        unit: 'cup',
        servingSizeG: 100,
        measures: null,
      }),
    ).toBeNull();
  });

  it('captures the replacement food instead of the previous snapshot', () => {
    const previous: ConsumedNutritionEvidence = {
      schema_version: NDS_CONSUMED_EVIDENCE_VERSION,
      lineage: 'write_time_capture',
      food_object_id: 'broccoli',
      catalog_version: null,
      quantity: 0.5,
      unit: 'g',
      quantity_g: 50,
      quantity_conversion: 'exact',
      calories: 17,
      protein_g: 1.4,
      fiber_g: 1.3,
      added_sugar_g: null,
      added_sugar_provenance: 'unknown',
      nutrient_basis: 'per_serving',
    };
    const result = attachConsumedNutritionEvidence(
      {
        foodObjectId: 'lentils',
        quantity: 50,
        unit: 'g',
        calories: 80,
        macros: { protein: 6 },
        nutrition_basis: 'per_100g',
      },
      {
        quantityG: 50,
        quantityConversion: 'exact',
        quantityChanged: false,
        previousFoodObjectId: 'broccoli',
        retainExisting: previous,
      },
    );
    const evidence = result.consumed_nutrition_evidence as ConsumedNutritionEvidence;
    expect(evidence.lineage).toBe('write_time_capture');
    expect(evidence.food_object_id).toBe('lentils');
    expect(evidence.calories).toBe(80);
    expect(evidence.protein_g).toBe(6);
    expect(evidence.nutrient_basis).toBe('per_100g');
    expect(evidence.calories).not.toBe(previous.calories);
  });

  it('replaces null-id evidence when a different null-id food is saved', () => {
    const previous: ConsumedNutritionEvidence = {
      schema_version: NDS_CONSUMED_EVIDENCE_VERSION,
      lineage: 'write_time_capture',
      food_object_id: null,
      food_source_key: 'off:old-17',
      catalog_version: null,
      quantity: 50,
      unit: 'g',
      quantity_g: 50,
      quantity_conversion: 'exact',
      calories: 17,
      protein_g: 1.4,
      fiber_g: 1.3,
      added_sugar_g: null,
      added_sugar_provenance: 'unknown',
      nutrient_basis: 'per_serving',
    };
    const result = attachConsumedNutritionEvidence(
      {
        name: 'Lentils, Open Food Facts',
        foodSourceKey: 'off:new-80',
        quantity: 50,
        unit: 'g',
        calories: 80,
        macros: { protein: 6 },
        nutrition_basis: 'per_100g',
      },
      {
        quantityG: 50,
        quantityConversion: 'exact',
        quantityChanged: false,
        previousFoodObjectId: null,
        previousSourceKey: 'off:old-17',
        previousName: 'Broccoli, Open Food Facts',
        retainExisting: previous,
      },
    );
    const evidence = result.consumed_nutrition_evidence as ConsumedNutritionEvidence;
    expect(evidence.lineage).toBe('write_time_capture');
    expect(evidence.food_object_id).toBeNull();
    expect(evidence.food_source_key).toBe('off:new-80');
    expect(evidence.calories).toBe(80);
    expect(evidence.protein_g).toBe(6);
    expect(evidence.nutrient_basis).toBe('per_100g');
    expect(evidence.quantity).toBe(50);
    expect(evidence.quantity_g).toBe(50);
    expect(evidence.unit).toBe('g');
    expect(evidence.calories).not.toBe(17);
  });

  it('replaces same-name null-id evidence when no source key proves identity', () => {
    const previous: ConsumedNutritionEvidence = {
      schema_version: NDS_CONSUMED_EVIDENCE_VERSION,
      lineage: 'write_time_capture',
      food_object_id: null,
      food_source_key: null,
      catalog_version: null,
      quantity: 50,
      unit: 'g',
      quantity_g: 50,
      quantity_conversion: 'exact',
      calories: 17,
      protein_g: 1.4,
      fiber_g: null,
      added_sugar_g: null,
      added_sugar_provenance: 'unknown',
      nutrient_basis: 'per_serving',
    };
    const result = attachConsumedNutritionEvidence(
      {
        name: 'Lentils',
        quantity: 50,
        unit: 'g',
        calories: 80,
        macros: { protein: 6 },
        nutrition_basis: 'per_100g',
      },
      {
        quantityG: 50,
        quantityConversion: 'exact',
        quantityChanged: false,
        previousFoodObjectId: null,
        previousSourceKey: null,
        previousName: 'Lentils',
        retainExisting: previous,
      },
    );
    const evidence = result.consumed_nutrition_evidence as ConsumedNutritionEvidence;
    expect(evidence.lineage).toBe('write_time_capture');
    expect(evidence.food_object_id).toBeNull();
    expect(evidence.food_source_key).toBeNull();
    expect(evidence.calories).toBe(80);
    expect(evidence.protein_g).toBe(6);
    expect(evidence.nutrient_basis).toBe('per_100g');
    expect(evidence.quantity).toBe(50);
    expect(evidence.quantity_g).toBe(50);
    expect(evidence.unit).toBe('g');
    expect(evidence.calories).not.toBe(17);
  });

  it('scales an unchanged unkeyed null-id record when only the quantity changes', () => {
    const previous: ConsumedNutritionEvidence = {
      schema_version: NDS_CONSUMED_EVIDENCE_VERSION,
      lineage: 'write_time_capture',
      food_object_id: null,
      catalog_version: null,
      quantity: 50,
      unit: 'g',
      quantity_g: 50,
      quantity_conversion: 'exact',
      calories: 17,
      protein_g: 1.4,
      fiber_g: null,
      added_sugar_g: null,
      added_sugar_provenance: 'unknown',
      nutrient_basis: 'per_serving',
    };
    const result = attachConsumedNutritionEvidence(
      {
        name: 'Lentils',
        quantity: 1,
        unit: 'g',
        servingSizeG: 100,
        calories: 17,
        macros: { protein: 1.4 },
        nutrition_basis: 'per_serving',
      },
      {
        quantityG: 100,
        quantityConversion: 'exact',
        quantityChanged: true,
        previousFoodObjectId: null,
        previousSourceKey: null,
        previousName: 'Lentils',
        sameUnkeyedRecord: true,
        retainExisting: previous,
      },
    );
    const evidence = result.consumed_nutrition_evidence as ConsumedNutritionEvidence;
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.food_object_id).toBeNull();
    expect(evidence.calories).toBe(17);
    expect(evidence.protein_g).toBeCloseTo(1.4);
    expect(evidence.quantity).toBe(1);
    expect(evidence.quantity_g).toBe(100);
    expect(evidence.nutrient_basis).toBe('per_serving');
  });

  it('scales a null-id food when the source identity is unchanged', () => {
    const previous: ConsumedNutritionEvidence = {
      schema_version: NDS_CONSUMED_EVIDENCE_VERSION,
      lineage: 'write_time_capture',
      food_object_id: null,
      food_source_key: 'off:lentils',
      catalog_version: null,
      quantity: 0.5,
      unit: 'g',
      quantity_g: 50,
      quantity_conversion: 'exact',
      calories: 80,
      protein_g: 6,
      fiber_g: null,
      added_sugar_g: null,
      added_sugar_provenance: 'unknown',
      nutrient_basis: 'per_100g',
    };
    const result = attachConsumedNutritionEvidence(
      {
        name: 'Lentils, Open Food Facts',
        foodSourceKey: 'off:lentils',
        quantity: 1,
        unit: 'g',
        servingSizeG: 100,
        calories: 80,
        macros: { protein: 6 },
        nutrition_basis: 'per_100g',
      },
      {
        quantityG: 100,
        quantityConversion: 'exact',
        quantityChanged: true,
        previousFoodObjectId: null,
        previousSourceKey: 'off:lentils',
        previousName: 'Lentils, Open Food Facts',
        retainExisting: previous,
      },
    );
    const evidence = result.consumed_nutrition_evidence as ConsumedNutritionEvidence;
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.food_object_id).toBeNull();
    expect(evidence.food_source_key).toBe('off:lentils');
    expect(evidence.calories).toBe(80);
    expect(evidence.protein_g).toBe(6);
    expect(evidence.quantity).toBe(1);
    expect(evidence.quantity_g).toBe(100);
    expect(evidence.nutrient_basis).toBe('per_100g');
  });

  it('clears a catalog id when the replacement states an explicit null', () => {
    const payload = buildCommittedSingleItemPayload({
      current: {
        name: 'Broccoli',
        quantity: 50,
        unit: 'g',
        calories: 17,
        macros: { protein: 1.4 },
        foodObjectId: 'broccoli',
        servingSizeG: 91,
        nutrition_basis: 'per_serving',
      },
      replacement: {
        ...replacement,
        title: 'Lentils, Open Food Facts',
        foodObjectId: null,
        calories: 80,
        macros: { protein: 6, carbs: null, fat: null },
        nutritionBasis: 'per_100g',
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
      },
      quantity: 50,
      unit: 'g',
    });
    expect(payload.foodObjectId).toBeUndefined();
    expect(payload.name).toBe('Lentils, Open Food Facts');
    expect(payload.calories).toBe(80);
    expect(payload.nutrition_basis).toBe('per_100g');
    expect(payload.quantity).toBe(50);
    expect(payload.unit).toBe('g');

    const previous: ConsumedNutritionEvidence = {
      schema_version: NDS_CONSUMED_EVIDENCE_VERSION,
      lineage: 'write_time_capture',
      food_object_id: 'broccoli',
      catalog_version: null,
      quantity: 50,
      unit: 'g',
      quantity_g: 50,
      quantity_conversion: 'exact',
      calories: 17,
      protein_g: 1.4,
      fiber_g: null,
      added_sugar_g: null,
      added_sugar_provenance: 'unknown',
      nutrient_basis: 'per_serving',
    };
    const saved = attachConsumedNutritionEvidence(
      payload as unknown as Record<string, unknown>,
      {
      quantityG: 50,
      quantityConversion: 'exact',
      quantityChanged: false,
      previousFoodObjectId: 'broccoli',
      retainExisting: previous,
      },
    );
    const evidence = saved.consumed_nutrition_evidence as ConsumedNutritionEvidence;
    expect(saved.foodObjectId).toBeUndefined();
    expect(evidence.food_object_id).toBeNull();
    expect(evidence.lineage).toBe('write_time_capture');
    expect(evidence.calories).toBe(80);
    expect(evidence.protein_g).toBe(6);
    expect(evidence.nutrient_basis).toBe('per_100g');
  });

  it('keeps the saved id when no replacement is selected', () => {
    const payload = buildCommittedSingleItemPayload({
      current: {
        name: 'Broccoli',
        quantity: 1,
        unit: 'serving',
        foodObjectId: 'broccoli',
        nutrition_basis: 'per_serving',
      },
      quantity: 2,
      unit: 'serving',
    });
    expect(payload.foodObjectId).toBe('broccoli');
    expect(payload.nutrition_basis).toBe('per_serving');
  });
});
