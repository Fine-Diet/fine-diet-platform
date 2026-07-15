import { buildReplaceInMealRoute } from '../groceryReplaceInMealRoute';
import type { GroceryItem, PlannedMeal } from '../types';

function meal(partial: Partial<PlannedMeal> & Pick<PlannedMeal, 'id'>): PlannedMeal {
  return {
    plan_id: 'plan-1',
    plan_day_id: partial.plan_day_id ?? 'day-1',
    plan_slot_id: 'slot-1',
    person_id: 'person-1',
    name: partial.name ?? 'Meal',
    meal_type: 'lunch',
    payload: { items: [] },
    source_template_id: null,
    source_imported_meal_id: partial.source_imported_meal_id ?? null,
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
    ...partial,
  };
}

describe('buildReplaceInMealRoute', () => {
  const item: Pick<GroceryItem, 'source_planned_meal_ids'> = {
    source_planned_meal_ids: ['meal-a', 'meal-b'],
  };

  it('routes import-derived meals to the import editor', () => {
    const route = buildReplaceInMealRoute(
      item,
      [
        meal({ id: 'meal-a', source_imported_meal_id: 'import-1', name: 'Salad A' }),
        meal({ id: 'meal-b', plan_day_id: 'day-2', name: 'Salad B' }),
      ],
      'plan-1',
      { 'day-1': '2026-07-15', 'day-2': '2026-07-16' },
    );
    expect(route.kind).toBe('choice');
    if (route.kind === 'choice') {
      expect(route.options).toHaveLength(2);
      expect(route.options[0]?.href).toContain('/imports/import-1');
      expect(route.options[1]?.href).toContain('editMeal=meal-b');
    }
  });

  it('does not silently choose the first contributor when multiple exist', () => {
    const route = buildReplaceInMealRoute(
      { source_planned_meal_ids: ['meal-a', 'meal-b'] },
      [
        meal({ id: 'meal-a', name: 'Breakfast oats' }),
        meal({ id: 'meal-b', name: 'Lunch oats', plan_day_id: 'day-2' }),
      ],
      'plan-1',
      { 'day-1': '2026-07-15', 'day-2': '2026-07-16' },
    );
    expect(route.kind).toBe('choice');
  });

  it('returns a single route for one contributor', () => {
    const route = buildReplaceInMealRoute(
      { source_planned_meal_ids: ['meal-a'] },
      [meal({ id: 'meal-a', source_imported_meal_id: 'import-9' })],
      'plan-1',
      { 'day-1': '2026-07-15' },
    );
    expect(route.kind).toBe('single');
    if (route.kind === 'single') {
      expect(route.option.href).toContain('/imports/import-9');
    }
  });
});
