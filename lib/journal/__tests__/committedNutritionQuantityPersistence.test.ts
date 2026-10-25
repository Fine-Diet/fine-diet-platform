import { beforeEach, describe, expect, it, jest } from '@jest/globals';
let currentRow: Record<string, unknown>;
let persistedUpdates: Record<string, unknown>;

function chainReturning(data: Record<string, unknown>) {
  const chain = {
    eq: jest.fn(),
    select: jest.fn(),
    single: jest.fn(async () => ({ data, error: null })),
  };
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: () => chainReturning(currentRow),
      update: (updates: Record<string, unknown>) => {
        persistedUpdates = updates;
        return chainReturning({ ...currentRow, ...updates });
      },
    })),
  },
}));

import { buildCommittedSingleItemPayload } from '../committedNutritionEdit';
import { updateEntry } from '../journalServerService';
import type { JournalEntryPayload } from '../journalServerService';
import type { IntakePayload } from '../types';
import type { LogNutritionSingleItemDraftEntryV1 } from '@/lib/logDraft/logNutritionDraft';
import { normalizeConsumedEntry } from '@/lib/nds/consumedInputs/normalizeConsumedEntry';

const BASE_ROW = {
  id: 'entry-1',
  person_id: 'person-1',
  entry_type: 'intake',
  occurred_at: '2026-09-10T12:00:00.000Z',
  payload: {
    name: 'Beans',
    quantity: 1,
    unit: 'serving',
    calories: 100,
    macros: { protein: 10, carbs: 20, fat: 2 },
    servingSizeG: 100,
    measures: [{ unit: 'cup', grams: 200 }],
  },
  quantity_g: 100,
  protein_score_10: null,
  is_main_meal: null,
  meal_derived_data: null,
  created_at: '2026-09-10T12:00:00.000Z',
  updated_at: '2026-09-10T12:00:00.000Z',
};

describe('Packet 15B committed quantity persistence', () => {
  beforeEach(() => {
    currentRow = structuredClone(BASE_ROW);
    persistedUpdates = {};
  });

  it('persists gram display input as canonical serving multiplier + quantity_g', async () => {
    const payload = {
      ...(currentRow.payload as Record<string, unknown>),
      quantity: 200,
      unit: 'g',
    };
    const entry = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload,
      replacePayload: true,
      quantityG: 200,
    });
    const persistedPayload = persistedUpdates.payload as Record<string, unknown>;
    expect(persistedPayload.quantity).toBe(2);
    expect(persistedPayload.unit).toBe('g');
    expect(persistedUpdates.quantity_g).toBe(200);
    expect(entry?.quantityG).toBe(200);
    expect(entry?.payload.calories).toBe(100);
  });

  it('persists an equivalent household amount without changing nutrition', async () => {
    const payload = {
      ...(currentRow.payload as Record<string, unknown>),
      quantity: 0.5,
      unit: 'cup',
    };
    const entry = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload,
      replacePayload: true,
    });
    const persistedPayload = persistedUpdates.payload as Record<string, unknown>;
    expect(persistedPayload.quantity).toBe(1);
    expect(persistedPayload.unit).toBe('cup');
    expect(persistedUpdates.quantity_g).toBe(100);
    expect(entry?.quantityG).toBe(100);
    expect(entry?.payload.calories).toBe(100);
  });

  it('persists a changed serving amount with coherent canonical grams', async () => {
    const payload = {
      ...(currentRow.payload as Record<string, unknown>),
      quantity: 2,
      unit: 'serving',
    };
    const entry = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload,
      replacePayload: true,
    });
    const persistedPayload = persistedUpdates.payload as Record<string, unknown>;
    expect(persistedPayload.quantity).toBe(2);
    expect(persistedUpdates.quantity_g).toBe(200);
    expect(entry?.quantityG).toBe(200);
    expect((entry?.payload.calories ?? 0) * (entry?.payload.quantity ?? 0)).toBe(200);
  });

  it('preserves per-serving fiber and authored added sugar, scaling each once on quantity save', async () => {
    currentRow = structuredClone({
      ...BASE_ROW,
      payload: {
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
        servingSizeG: 100,
        nutrition_basis: 'per_serving',
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: null,
          food_source_key: null,
          catalog_version: null,
          quantity: 1,
          unit: 'serving',
          quantity_g: 100,
          quantity_conversion: 'exact',
          calories: 100,
          protein_g: 10,
          fiber_g: 4,
          added_sugar_g: 5,
          added_sugar_provenance: 'authored',
          nutrient_basis: 'per_serving',
        },
      },
      quantity_g: 100,
    });

    const payload = buildCommittedSingleItemPayload({
      current: currentRow.payload as never,
      quantity: 2,
      unit: 'serving',
    });
    const {
      consumed_nutrition_evidence: clientEvidence,
      ...payloadWithoutClientEvidence
    } = payload;
    expect(clientEvidence).toBeUndefined();
    const saved = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: payloadWithoutClientEvidence,
      replacePayload: true,
    });

    const persisted = persistedUpdates.payload as Record<string, any>;
    expect(persisted.macros.fiber_g).toBe(4);
    expect(persisted.macros.added_sugar_g).toBe(5);
    expect(persisted.macros.added_sugar_provenance).toBe('authored');
    expect(persisted.added_sugar_provenance).toBe('authored');
    expect(persisted.quantity).toBe(2);

    const evidence = persisted.consumed_nutrition_evidence;
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.fiber_g).toBe(8);
    expect(evidence.added_sugar_g).toBe(10);
    expect(evidence.added_sugar_provenance).toBe('authored');

    const normalized = normalizeConsumedEntry({
      id: saved!.id,
      person_id: 'person-1',
      entry_type: 'intake',
      occurred_at: saved!.timestamp.toISOString(),
      payload: saved!.payload as Record<string, unknown>,
      quantity_g: saved!.quantityG,
    });
    expect(normalized?.fiber_g.value).toBe(8);
    expect(normalized?.added_sugar_g.value).toBe(10);
  });

  it('persists an Open Food Facts replacement without the previous catalog id', async () => {
    currentRow = structuredClone({
      ...BASE_ROW,
      payload: {
        name: 'Broccoli',
        quantity: 50,
        unit: 'g',
        calories: 17,
        macros: { protein: 1.4 },
        foodObjectId: 'broccoli',
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: 'per_serving',
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
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
        },
      },
      quantity_g: 50,
    });
    const off: LogNutritionSingleItemDraftEntryV1 = {
      id: 'off-lentils',
      sourceKey: 'food:off-lentils',
      kind: 'single_item',
      title: 'Lentils, Open Food Facts',
      quantity: 1,
      unit: 'serving',
      calories: 80,
      macros: { protein: 6, carbs: null, fat: null },
      foodObjectId: null,
      nutritionBasis: 'per_100g',
      servingSizeG: 100,
      measures: [{ unit: 'g', grams: 1 }],
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    };
    const payload = buildCommittedSingleItemPayload({
      current: currentRow.payload as never,
      replacement: off,
      quantity: 50,
      unit: 'g',
    });
    const saved = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: payload as unknown as Partial<JournalEntryPayload>,
      replacePayload: true,
      quantityG: 50,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      food_object_id: string | null;
      food_source_key?: string | null;
      calories: number;
      quantity: number | null;
      quantity_g: number | null;
      unit: string | null;
      nutrient_basis: string | null;
      protein_g: number | null;
      lineage: string;
    };
    expect(persisted.foodObjectId).toBeUndefined();
    expect(persisted.foodSourceKey).toBe('food:off-lentils');
    expect(persisted.name).toBe('Lentils, Open Food Facts');
    expect(persisted.nutrition_basis).toBe('per_100g');
    expect(persisted.unit).toBe('g');
    expect(persisted.unit).not.toBe('cup');
    expect(persistedUpdates.quantity_g).toBe(50);
    expect(evidence.food_object_id).toBeNull();
    expect(evidence.food_source_key).toBe('food:off-lentils');
    expect(evidence.lineage).toBe('write_time_capture');
    expect(evidence.calories).toBe(80);
    expect(evidence.nutrient_basis).toBe('per_100g');
    expect(evidence.quantity_g).toBe(50);
    expect(evidence.unit).toBe('g');
    expect(evidence.quantity).toBe(persisted.quantity);
    expect(evidence.calories).not.toBe(17);
  });

  it('replaces same-name null-id evidence through the mocked journal save', async () => {
    currentRow = structuredClone({
      ...BASE_ROW,
      payload: {
        name: 'Lentils',
        quantity: 0.5,
        unit: 'g',
        calories: 17,
        macros: { protein: 1.4, carbs: 2, fat: 0.2 },
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: 'per_serving',
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: null,
          food_source_key: null,
          catalog_version: null,
          quantity: 0.5,
          unit: 'g',
          quantity_g: 50,
          quantity_conversion: 'exact',
          calories: 17,
          protein_g: 1.4,
          fiber_g: null,
          added_sugar_g: null,
          added_sugar_provenance: 'unknown',
          nutrient_basis: 'per_serving',
        },
      },
      quantity_g: 50,
    });
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        name: 'Lentils',
        quantity: 50,
        unit: 'g',
        calories: 80,
        macros: { protein: 6, carbs: 8, fat: 0.4 },
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: 'per_100g',
      } as unknown as Partial<JournalEntryPayload>,
      replacePayload: true,
      quantityG: 50,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      food_object_id: string | null;
      food_source_key?: string | null;
      calories: number;
      quantity: number | null;
      quantity_g: number | null;
      unit: string | null;
      nutrient_basis: string | null;
      protein_g: number | null;
      lineage: string;
    };
    expect(persisted.name).toBe('Lentils');
    expect(persisted.foodObjectId).toBeUndefined();
    expect(persisted.foodSourceKey).toBeUndefined();
    expect(persisted.nutrition_basis).toBe('per_100g');
    expect(persisted.unit).toBe('g');
    expect(persistedUpdates.quantity_g).toBe(50);
    expect(evidence.lineage).toBe('write_time_capture');
    expect(evidence.food_object_id).toBeNull();
    expect(evidence.food_source_key).toBeNull();
    expect(evidence.calories).toBe(80);
    expect(evidence.protein_g).toBe(6);
    expect(evidence.nutrient_basis).toBe('per_100g');
    expect(evidence.quantity_g).toBe(50);
    expect(evidence.unit).toBe('g');
    expect(evidence.quantity).toBe(persisted.quantity);
    expect(evidence.calories).not.toBe(17);
  });

  it('scales a same-record unkeyed null-id edit through the mocked journal save', async () => {
    currentRow = structuredClone({
      ...BASE_ROW,
      payload: {
        name: 'Lentils',
        quantity: 0.5,
        unit: 'g',
        calories: 17,
        macros: { protein: 1.4, carbs: 2, fat: 0.2 },
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: 'per_serving',
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: null,
          catalog_version: null,
          quantity: 0.5,
          unit: 'g',
          quantity_g: 50,
          quantity_conversion: 'exact',
          calories: 17,
          protein_g: 1.4,
          fiber_g: null,
          added_sugar_g: null,
          added_sugar_provenance: 'unknown',
          nutrient_basis: 'per_serving',
        },
      },
      quantity_g: 50,
    });
    const saved = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: 100,
        unit: 'g',
      },
      replacePayload: true,
      quantityG: 100,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      protein_g: number;
      quantity: number | null;
      quantity_g: number | null;
      unit: string | null;
      nutrient_basis: string | null;
      lineage: string;
    };
    expect(persisted.calories).toBe(17);
    expect(persisted.unit).toBe('g');
    expect(persistedUpdates.quantity_g).toBe(100);
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    // The write-time snapshot still records per-serving source nutrition.
    // Once retained, its consumed total at one serving is 17 kcal / 1.4 g.
    expect(evidence.calories).toBe(17);
    expect(evidence.protein_g).toBeCloseTo(1.4);
    expect(evidence.quantity_g).toBe(100);
    expect(evidence.unit).toBe('g');
    expect(evidence.quantity).toBe(persisted.quantity);
    expect(evidence.nutrient_basis).toBe('per_serving');
    const normalized = normalizeConsumedEntry({
      id: saved!.id,
      person_id: 'person-1',
      entry_type: 'intake',
      occurred_at: saved!.timestamp.toISOString(),
      payload: saved!.payload as Record<string, unknown>,
      quantity_g: saved!.quantityG,
    });
    expect(normalized?.calories.value).toBe(17);
    expect(normalized?.protein_g.value).toBeCloseTo(1.4);
  });

  function lentilQuantityRow(basis: 'per_serving' | 'per_100g') {
    return structuredClone({
      ...BASE_ROW,
      payload: {
        name: 'Lentils',
        quantity: 0.5,
        unit: 'g',
        calories: 17,
        macros: { protein: 1.4, carbs: 2, fat: 0.2, fiber: 3 },
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: basis,
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: null,
          food_source_key: null,
          catalog_version: null,
          quantity: 0.5,
          unit: 'g',
          quantity_g: 50,
          quantity_conversion: 'exact',
          calories: 17,
          protein_g: 1.4,
          fiber_g: 3,
          added_sugar_g: null,
          added_sugar_provenance: 'unknown',
          nutrient_basis: basis,
        },
      },
      quantity_g: 50,
    });
  }

  it('keeps per-serving nutrients when grams and serving size change by the same factor', async () => {
    currentRow = lentilQuantityRow('per_serving');
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: 100,
        unit: 'g',
        servingSizeG: 200,
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: null,
          catalog_version: null,
          quantity: 0.5,
          unit: 'g',
          quantity_g: 1,
          quantity_conversion: 'exact',
          calories: 999,
          protein_g: 99,
          fiber_g: 99,
          added_sugar_g: null,
          added_sugar_provenance: 'unknown',
          nutrient_basis: 'per_serving',
        },
      },
      replacePayload: true,
      quantityG: 100,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      protein_g: number;
      fiber_g: number;
      quantity: number | null;
      quantity_g: number | null;
      nutrient_basis: string | null;
      lineage: string;
    };
    expect(persisted.quantity).toBe(0.5);
    expect(persisted.calories).toBe(17);
    expect(persistedUpdates.quantity_g).toBe(100);
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.calories).toBe(8.5);
    expect(evidence.protein_g).toBeCloseTo(0.7);
    expect(evidence.fiber_g).toBe(1.5);
    expect(evidence.quantity_g).toBe(100);
    expect(evidence.quantity).toBe(persisted.quantity);
    expect(evidence.nutrient_basis).toBe('per_serving');
    expect(evidence.calories).not.toBe(999);
  });

  it('scales per-100g nutrients with grams when the serving multiplier stays the same', async () => {
    currentRow = lentilQuantityRow('per_100g');
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: 100,
        unit: 'g',
        servingSizeG: 200,
      },
      replacePayload: true,
      quantityG: 100,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      protein_g: number;
      fiber_g: number;
      quantity: number | null;
      quantity_g: number | null;
      nutrient_basis: string | null;
      lineage: string;
    };
    expect(persisted.quantity).toBe(0.5);
    expect(persisted.calories).toBe(17);
    expect(persistedUpdates.quantity_g).toBe(100);
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.calories).toBe(17);
    expect(evidence.protein_g).toBeCloseTo(1.4);
    expect(evidence.fiber_g).toBe(3);
    expect(evidence.quantity_g).toBe(100);
    expect(evidence.quantity).toBe(0.5);
    expect(evidence.nutrient_basis).toBe('per_100g');
  });

  it('scales a per-100g grams-only edit by the gram ratio', async () => {
    currentRow = lentilQuantityRow('per_100g');
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: 100,
        unit: 'g',
      },
      replacePayload: true,
      quantityG: 100,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      quantity_g: number | null;
      quantity: number | null;
      lineage: string;
    };
    expect(persisted.quantity).toBe(1);
    expect(persistedUpdates.quantity_g).toBe(100);
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.calories).toBe(17);
    expect(evidence.quantity_g).toBe(100);
    expect(evidence.quantity).toBe(1);
  });

  it('scales a per-serving edit that changes serving size and keeps grams', async () => {
    currentRow = lentilQuantityRow('per_serving');
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: 50,
        unit: 'g',
        servingSizeG: 200,
      },
      replacePayload: true,
      quantityG: 50,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      protein_g: number;
      quantity: number | null;
      quantity_g: number | null;
      lineage: string;
    };
    expect(persisted.quantity).toBe(0.25);
    expect(persistedUpdates.quantity_g).toBe(50);
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.calories).toBe(4.25);
    expect(evidence.protein_g).toBeCloseTo(0.35);
    expect(evidence.quantity).toBe(0.25);
    expect(evidence.quantity_g).toBe(50);
  });

  it('does not rescale per-100g nutrients when only the serving size changes', async () => {
    currentRow = lentilQuantityRow('per_100g');
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: 50,
        unit: 'g',
        servingSizeG: 200,
      },
      replacePayload: true,
      quantityG: 50,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      protein_g: number;
      quantity: number | null;
      quantity_g: number | null;
      nutrient_basis: string | null;
      lineage: string;
    };
    expect(persisted.quantity).toBe(0.25);
    expect(persisted.calories).toBe(17);
    expect(persistedUpdates.quantity_g).toBe(50);
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.calories).toBe(8.5);
    expect(evidence.protein_g).toBeCloseTo(0.7);
    expect(evidence.quantity).toBe(0.25);
    expect(evidence.quantity_g).toBe(50);
    expect(evidence.nutrient_basis).toBe('per_100g');
  });

  it('does not invent a nutrient scale for an unsupported household conversion', async () => {
    currentRow = lentilQuantityRow('per_serving');
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: 2,
        unit: 'piece',
      },
      replacePayload: true,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      quantity: number | null;
      quantity_g: number | null;
      quantity_conversion: string;
      lineage: string;
    };
    expect(persisted.quantity).toBe(2);
    expect(persisted.unit).toBe('piece');
    expect(persisted.quantity_conversion).toBe('household_measure_unavailable');
    expect(persistedUpdates.quantity_g).toBeNull();
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.calories).toBe(17);
    expect(evidence.quantity).toBe(2);
    expect(evidence.quantity_g).toBeNull();
    expect(evidence.quantity_conversion).toBe('household_measure_unavailable');
  });

  it('keeps historical evidence when a stable source key corrects nutrition without a quantity change', async () => {
    currentRow = structuredClone({
      ...BASE_ROW,
      payload: {
        name: 'Lentils',
        quantity: 0.5,
        unit: 'g',
        calories: 17,
        macros: { protein: 1.4 },
        foodSourceKey: 'off:lentils',
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: 'per_serving',
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: null,
          food_source_key: 'off:lentils',
          catalog_version: null,
          quantity: 0.5,
          unit: 'g',
          quantity_g: 50,
          quantity_conversion: 'exact',
          calories: 17,
          protein_g: 1.4,
          fiber_g: null,
          added_sugar_g: null,
          added_sugar_provenance: 'unknown',
          nutrient_basis: 'per_serving',
        },
      },
      quantity_g: 50,
    });
    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        calories: 80,
        macros: { protein: 6 },
      },
      replacePayload: true,
      quantityG: 50,
    });
    const persisted = persistedUpdates.payload as Record<string, unknown>;
    const evidence = persisted.consumed_nutrition_evidence as {
      calories: number;
      quantity_g: number | null;
      lineage: string;
      food_source_key?: string | null;
    };
    expect(persisted.calories).toBe(80);
    expect(persisted.foodSourceKey).toBe('off:lentils');
    expect(persistedUpdates.quantity_g).toBe(50);
    expect(evidence.lineage).toBe('write_time_capture');
    expect(evidence.calories).toBe(17);
    expect(evidence.quantity_g).toBe(50);
    expect(evidence.food_source_key).toBe('off:lentils');
  });
});

describe('persisted nutrition evidence normalization', () => {
  beforeEach(() => {
    currentRow = structuredClone(BASE_ROW);
    persistedUpdates = {};
  });

  it.each([
    {
      name: 'per-serving fiber 3 at multiplier 0.5',
      basis: 'per_serving',
      priorGrams: 25,
      nextGrams: 50,
      expectedFiber: 1.5,
      expectedCalories: 100,
      expectedProtein: 5,
      expectedAddedSugar: 2,
      rawFiber: 3,
    },
    {
      name: 'per-100g fiber 3 at 50 g',
      basis: 'per_100g',
      priorGrams: 100,
      nextGrams: 50,
      expectedFiber: 1.5,
      expectedCalories: 100,
      expectedProtein: 5,
      expectedAddedSugar: 2,
      rawFiber: 3,
    },
    {
      name: 'per-100g fiber 3 at 100 g',
      basis: 'per_100g',
      priorGrams: 50,
      nextGrams: 100,
      expectedFiber: 3,
      expectedCalories: 200,
      expectedProtein: 10,
      expectedAddedSugar: 4,
      rawFiber: 3,
    },
    {
      name: 'per-serving fiber 17 at multiplier 0.25',
      basis: 'per_serving',
      priorGrams: 50,
      nextGrams: 25,
      expectedFiber: 4.25,
      expectedCalories: 50,
      expectedProtein: 2.5,
      expectedAddedSugar: 1,
      rawFiber: 17,
    },
  ])('normalizes the actual saved row: $name', async ({
    basis,
    priorGrams,
    nextGrams,
    expectedFiber,
    expectedCalories,
    expectedProtein,
    expectedAddedSugar,
    rawFiber,
  }) => {
    const priorQuantity = priorGrams / 100;
    currentRow = structuredClone({
      ...BASE_ROW,
      payload: {
        name: 'Lentils',
        quantity: priorQuantity,
        unit: 'g',
        calories: 200,
        macros: {
          protein: 10,
          fiber: rawFiber,
          added_sugar_g: 4,
          added_sugar_provenance: 'authored',
        },
        foodObjectId: 'food-lentils',
        servingSizeG: 100,
        measures: [{ unit: 'g', grams: 1 }],
        nutrition_basis: basis,
        consumed_nutrition_evidence: {
          schema_version: 'nds_consumed_evidence_2026-09-13.v1',
          lineage: 'write_time_capture',
          food_object_id: 'food-lentils',
          food_source_key: null,
          catalog_version: 'catalog-v1',
          quantity: priorQuantity,
          unit: 'g',
          quantity_g: priorGrams,
          quantity_conversion: 'exact',
          calories: 200,
          protein_g: 10,
          fiber_g: rawFiber,
          added_sugar_g: 4,
          added_sugar_provenance: 'authored',
          nutrient_basis: basis,
        },
      },
      quantity_g: priorGrams,
    });

    // updateEntry's returned JournalEntry is the row returned by the mocked
    // persistence boundary, so the real normalizer consumes the saved payload.
    const saved = await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        ...(currentRow.payload as Record<string, unknown>),
        quantity: nextGrams,
        unit: 'g',
      },
      replacePayload: true,
      quantityG: nextGrams,
    });

    expect(saved).not.toBeNull();
    const normalized = normalizeConsumedEntry({
      id: saved!.id,
      person_id: 'person-1',
      entry_type: 'intake',
      occurred_at: saved!.timestamp.toISOString(),
      payload: saved!.payload as Record<string, unknown>,
      quantity_g: saved!.quantityG,
    });
    const evidence = saved!.payload.consumed_nutrition_evidence!;

    expect(saved!.quantityG).toBe(nextGrams);
    expect((saved!.payload as IntakePayload).nutrition_basis).toBe(basis);
    expect(saved!.payload.foodObjectId).toBe('food-lentils');
    expect(evidence.food_object_id).toBe('food-lentils');
    expect(evidence.nutrient_basis).toBe(basis);
    expect(evidence.lineage).toBe('retained_prior_snapshot');
    expect(evidence.quantity_g).toBe(nextGrams);
    expect(evidence.fiber_g).toBe(expectedFiber);
    expect(evidence.calories).toBe(expectedCalories);
    expect(evidence.protein_g).toBe(expectedProtein);
    expect(evidence.added_sugar_g).toBe(expectedAddedSugar);

    expect(normalized?.calories.value).toBe(expectedCalories);
    expect(normalized?.protein_g.value).toBe(expectedProtein);
    expect(normalized?.fiber_g.value).toBe(expectedFiber);
    expect(normalized?.added_sugar_g.value).toBe(expectedAddedSugar);
    expect(normalized?.quantityBasis.consumedGrams).toBe(nextGrams);
    expect(normalized?.components[0]?.foodObjectId).toBe('food-lentils');
    expect(normalized?.components[0]?.provenance).toBe('instance_snapshot');
  });
});
