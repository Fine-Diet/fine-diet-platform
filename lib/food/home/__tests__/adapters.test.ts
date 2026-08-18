import {
  buildFoodReadinessViewModel,
  buildLiveFoodHomeViewModel,
  mapEmptyReasonToReadyAnytimeStatus,
} from '../adapters';
import type { GroceryItem, Plan } from '@/lib/plans/types';

function plan(id = 'plan-1'): Plan {
  return {
    id,
    person_id: 'p1',
    title: 'Week plan',
    plan_shape: 'week',
    source: 'user_manual',
    status: 'active',
    start_date: '2026-08-02',
    end_date: '2026-08-08',
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: {} as Plan['input_snapshot_json'],
    nds_version: '1',
    classifier_version: '1',
    created_at: '',
    updated_at: '',
  };
}

function item(id: string, name: string, status: GroceryItem['status'] = 'pending'): GroceryItem {
  return {
    id,
    grocery_list_id: 'list-1',
    person_id: 'p1',
    name,
    quantity: 1,
    unit: 'lb',
    aisle_category: null,
    food_object_id: null,
    source_planned_meal_ids: [],
    status,
    notes: null,
    created_at: '',
    updated_at: '',
  };
}

describe('Food Home live adapters', () => {
  test('no active plan maps to no_active_plan', () => {
    const model = buildLiveFoodHomeViewModel({
      plan: null,
      readiness: null,
      groceryItems: [],
    });
    expect(model.readiness.status).toBe('no_active_plan');
    expect(model.readyAnytime.hasActivePlan).toBe(false);
    expect(model.fixtureId).toBe('live');
  });

  test('plan without grocery items maps to no_planned_requirements', () => {
    const readiness = buildFoodReadinessViewModel({
      plan: plan(),
      readiness: null,
      groceryItems: [],
    });
    expect(readiness.status).toBe('no_planned_requirements');
  });

  test('grocery list items surface as already_added (on-list truth)', () => {
    const readiness = buildFoodReadinessViewModel({
      plan: plan(),
      readiness: null,
      groceryItems: [item('a', 'Chicken'), item('b', 'Rice', 'have')],
    });
    expect(readiness.status).toBe('populated');
    expect(readiness.rows).toHaveLength(2);
    expect(readiness.rows.every((row) => row.status === 'already_added')).toBe(true);
  });

  test('coverage with zero to-buy maps to all_ready', () => {
    const readiness = buildFoodReadinessViewModel({
      plan: plan(),
      readiness: {
        state: 'has_grocery',
        pantry_items_saved: 2,
        pantry_presence: 'present',
        active_plan: { id: 'plan-1', title: 'Week' },
        grocery_scope: { date_start: '2026-08-02', date_end: '2026-08-08' },
        list_context: null,
        coverage: {
          rows_total: 2,
          rows_safe_match: 2,
          rows_covered_full: 2,
          rows_partial: 0,
          rows_to_buy: 0,
          rows_unresolved_identity: 0,
          rows_unit_or_amount_review: 0,
        },
      },
      groceryItems: [item('a', 'Chicken', 'have')],
    });
    expect(readiness.status).toBe('all_ready');
  });

  test('empty reasons map to Ready Anytime statuses', () => {
    expect(mapEmptyReasonToReadyAnytimeStatus('no_pending_meals')).toBe(
      'no_meals_in_range',
    );
    expect(mapEmptyReasonToReadyAnytimeStatus(null)).toBe('success');
  });
});
