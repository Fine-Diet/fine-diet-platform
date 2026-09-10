import { buildCommittedSingleItemPayload } from '../committedNutritionEdit';
import type { LogNutritionSingleItemDraftEntryV1 } from '@/lib/logDraft/logNutritionDraft';

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
