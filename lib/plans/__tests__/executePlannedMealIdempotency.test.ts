import {
  plannedMealAlreadyLogged,
  buildExactPlannedMealIntakePayload,
} from '../plannedMealExecutionPayload';
import type { PlannedMeal } from '../types';

/**
 * Idempotency guard semantics (mirrors planServerService eat path).
 * Full DB integration is covered separately; this locks the pre-insert gate.
 */
describe('planned meal execution idempotency guard', () => {
  const base: PlannedMeal = {
    id: 'meal-1',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    person_id: 'person-1',
    name: 'Test',
    meal_type: 'breakfast',
    payload: { totals: { calories: 100 } },
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'medium',
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    nds_version: '1',
    classifier_version: '1',
    execution_state: 'pending',
    journal_entry_id: null,
    created_at: '',
    updated_at: '',
  };

  it('exact payload builder is stable for repeat submissions', () => {
    const first = buildExactPlannedMealIntakePayload(base);
    const second = buildExactPlannedMealIntakePayload(base);
    expect(first).toEqual(second);
  });

  it('already-logged meals should short-circuit before a second insert', () => {
    const eaten: PlannedMeal = {
      ...base,
      execution_state: 'eaten',
      journal_entry_id: 'entry-abc',
    };
    expect(plannedMealAlreadyLogged(eaten)).toBe(true);
    expect(plannedMealAlreadyLogged(base)).toBe(false);
  });
});
