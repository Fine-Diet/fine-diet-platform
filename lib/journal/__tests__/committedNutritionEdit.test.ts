import {
  buildCommittedSingleItemPayload,
  convertCommittedSingleItemQuantity,
} from '../committedNutritionEdit';
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
});
