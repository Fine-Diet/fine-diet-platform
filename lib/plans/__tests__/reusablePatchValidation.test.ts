import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import {
  normalizeTemplatePatchBody,
  normalizeWeekPatternPatchBody,
  ReusablePatchValidationError,
} from '@/lib/plans/reusablePatchValidation';

const validMeal = {
  source_planned_meal_id: 'meal-1',
  name: 'Salad',
  meal_type: 'lunch' as const,
  payload: { items: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } },
  protein_score_10: null,
  is_main_meal: false,
  psq_multiplier: 1,
  meal_derived_data: {
    protein_score_10: null,
    is_main_meal: false,
    meal_calories: 0,
    meal_protein_g: 0,
    psq_multiplier: 1,
  },
  nds_confidence: 'medium' as const,
  source_template_id: null,
  source_imported_meal_id: null,
  nds_version: NDS_VERSION,
  classifier_version: CLASSIFIER_VERSION,
};

const validSlot = {
  source_plan_slot_id: 'slot-1',
  slot_ordinal: 1,
  slot_block: 'midday' as const,
  slot_label: 'Lunch',
  target_time: '12:00',
  meals: [validMeal],
};

describe('normalizeTemplatePatchBody', () => {
  test('accepts valid patch fields only', () => {
    expect(
      normalizeTemplatePatchBody({
        name: 'Weekday lunch',
        slots: [validSlot],
        unassigned_meals: [],
        extra: 'ignored',
      }),
    ).toEqual({
      name: 'Weekday lunch',
      slots: [validSlot],
      unassigned_meals: [],
    });
  });

  test('rejects malformed top-level field types', () => {
    expect(() => normalizeTemplatePatchBody({ name: 123 })).toThrow(/name must be a string/);
  });

  test('rejects malformed nested slot records', () => {
    expect(() =>
      normalizeTemplatePatchBody({
        slots: [{ source_plan_slot_id: 'slot-1', meals: 'bad' }],
      }),
    ).toThrow(/valid template slot records/);
  });

  test('rejects malformed nested meal records', () => {
    expect(() =>
      normalizeTemplatePatchBody({
        unassigned_meals: [{ source_planned_meal_id: 'meal-1' }],
      }),
    ).toThrow(/valid template meal records/);
  });
});

describe('normalizeWeekPatternPatchBody', () => {
  test('accepts valid week-pattern day arrays', () => {
    expect(
      normalizeWeekPatternPatchBody({
        name: 'Work week',
        days: [
          {
            day_offset: 0,
            source_plan_day_id: 'day-1',
            source_date_local: '2026-07-18',
            slots: [validSlot],
          },
        ],
      }),
    ).toEqual({
      name: 'Work week',
      days: [
        {
          day_offset: 0,
          source_plan_day_id: 'day-1',
          source_date_local: '2026-07-18',
          slots: [validSlot],
        },
      ],
    });
  });

  test('rejects malformed nested day records', () => {
    expect(() =>
      normalizeWeekPatternPatchBody({
        days: [{ day_offset: 0, slots: [] }],
      }),
    ).toThrow(/valid week-pattern day records/);
  });
});
