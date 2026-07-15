process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { deriveItemsFromMeals } from '../groceryServerService';
import type { PlannedMeal } from '../types';

function plannedMeal(items: Array<Record<string, unknown>>): PlannedMeal {
  return {
    id: 'meal-1',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    person_id: 'person-1',
    name: 'Test meal',
    meal_type: 'dinner',
    payload: { items },
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: 'pending',
    journal_entry_id: null,
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'medium',
    nds_version: '1',
    classifier_version: '1',
    created_at: '',
    updated_at: '',
  };
}

describe('deriveItemsFromMeals', () => {
  it('preserves required amounts and source planned-meal ids', () => {
    const derived = deriveItemsFromMeals([
      plannedMeal([
        { name: 'Spinach', quantity: 2, unit: 'cup', food_object_id: 'food-1' },
      ]),
    ]);
    expect(derived).toHaveLength(1);
    expect(derived[0]?.quantity).toBe(2);
    expect(derived[0]?.unit).toBe('cup');
    expect(derived[0]?.source_planned_meal_ids).toEqual(['meal-1']);
  });

  it('groups grounded rows by canonical identity and unit', () => {
    const derived = deriveItemsFromMeals([
      plannedMeal([
        { name: 'Spinach', quantity: 1, unit: 'cup', food_object_id: 'food-1' },
        { name: 'Baby spinach', quantity: 1, unit: 'cup', food_object_id: 'food-1' },
      ]),
    ]);
    expect(derived).toHaveLength(1);
    expect(derived[0]?.quantity).toBe(2);
  });

  it('keeps unresolved rows separate unless name and unit match exactly', () => {
    const derived = deriveItemsFromMeals([
      plannedMeal([
        { name: 'Spinach', quantity: 1, unit: 'cup', food_object_id: null },
        { name: 'Baby spinach', quantity: 1, unit: 'cup', food_object_id: null },
      ]),
    ]);
    expect(derived).toHaveLength(2);
  });
});
