import { recomputeTemplateMealDerivedFields } from '@/lib/plans/mealNDSShapeRecompute';
import type { PlanDayTemplateMeal } from '@/lib/plans/types';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';

describe('recomputeTemplateMealDerivedFields', () => {
  const staleMeal: PlanDayTemplateMeal = {
    source_planned_meal_id: 'meal-1',
    name: 'High protein bowl',
    meal_type: 'lunch',
    payload: {
      items: [{ food_object_id: 'food-1', calories: 500, protein_g: 40, carbs_g: 20, fat_g: 15 }],
      totals: { calories: 500, protein_g: 40, carbs_g: 20, fat_g: 15 },
    },
    protein_score_10: 2,
    is_main_meal: false,
    psq_multiplier: 0.5,
    meal_derived_data: {
      protein_score_10: 2,
      is_main_meal: false,
      meal_calories: 100,
      meal_protein_g: 5,
      psq_multiplier: 0.5,
    },
    nds_confidence: 'low',
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };

  test('recomputes derived fields from payload instead of preserving stale values', () => {
    const next = recomputeTemplateMealDerivedFields(staleMeal);
    expect(next.meal_derived_data.meal_calories).toBe(500);
    expect(next.meal_derived_data.meal_protein_g).toBe(40);
    expect(next.protein_score_10).not.toBe(2);
    expect(next.is_main_meal).toBe(true);
  });

  test('preserves identity and payload while refreshing nds shape', () => {
    const next = recomputeTemplateMealDerivedFields(staleMeal);
    expect(next.source_planned_meal_id).toBe(staleMeal.source_planned_meal_id);
    expect(next.payload).toEqual(staleMeal.payload);
    expect(next.nds_confidence).toBeDefined();
  });
});
