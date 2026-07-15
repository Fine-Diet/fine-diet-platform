import { assertAdjustedIntakePayloadAcceptable } from '../plannedMealAdjustedPayloadValidation';
import type { GroupedMealEntryPayload } from '@/lib/meals/types';

function validPayload(): GroupedMealEntryPayload {
  return {
    name: 'Adjusted meal',
    quantity: 1,
    unit: 'serving',
    calories: 400,
    macros: { protein: 20, carbs: 50, fat: 10 },
    meal_group: {
      schema_version: 1,
      name: 'Adjusted meal',
      source_meal_document_id: null,
      source_imported_meal_id: null,
      source_planned_meal_id: '11111111-1111-1111-1111-111111111111',
      source_template_id: null,
      components: [
        {
          component_id: 'c1',
          name: 'Oats',
          quantity: 1,
          unit: 'cup',
          food_object_id: null,
          calories: 400,
          macros: { protein_g: 20, carbs_g: 50, fat_g: 10 },
          nutrition_basis: 'per_component',
          match_status: 'none',
          source_kind: 'user_entered',
          needs_review: false,
        },
      ],
      totals: {
        calories: 400,
        macros: { protein_g: 20, carbs_g: 50, fat_g: 10 },
      },
      planned_servings: null,
      consumed_servings: 1,
      detached_from_source: true,
      instance_notes: null,
      needs_review: false,
      logged_as_planned: false,
    },
    logged_as_planned: false,
    source_planned_meal_id: '11111111-1111-1111-1111-111111111111',
  };
}

describe('assertAdjustedIntakePayloadAcceptable', () => {
  it('accepts a consistent, review-clear grouped payload', () => {
    expect(() => assertAdjustedIntakePayloadAcceptable(validPayload())).not.toThrow();
  });

  it('rejects payloads flagged needs_review', () => {
    const payload = validPayload();
    payload.meal_group!.needs_review = true;
    expect(() => assertAdjustedIntakePayloadAcceptable(payload)).toThrow(/nutrition review/i);
  });

  it('rejects payloads with review-required components', () => {
    const payload = validPayload();
    payload.meal_group!.components[0]!.needs_review = true;
    expect(() => assertAdjustedIntakePayloadAcceptable(payload)).toThrow(/components needing review/i);
  });

  it('rejects inconsistent top-level calorie totals', () => {
    const payload = validPayload();
    payload.calories = 999;
    expect(() => assertAdjustedIntakePayloadAcceptable(payload)).toThrow(/top-level calorie totals/i);
  });

  it('rejects tampered top-level protein macros', () => {
    const payload = validPayload();
    payload.macros!.protein = 99;
    expect(() => assertAdjustedIntakePayloadAcceptable(payload)).toThrow(/top-level protein totals/i);
  });

  it('rejects tampered group carbs totals versus component snapshot', () => {
    const payload = validPayload();
    payload.meal_group!.totals!.macros.carbs_g = 99;
    expect(() => assertAdjustedIntakePayloadAcceptable(payload)).toThrow(/group carbs totals/i);
  });

  it('rejects tampered group fat totals versus component snapshot', () => {
    const payload = validPayload();
    payload.meal_group!.totals!.macros.fat_g = 99;
    expect(() => assertAdjustedIntakePayloadAcceptable(payload)).toThrow(/group fat totals/i);
  });
});
