import {
  PLAN_GROCERY_HANDOFF_POLICY_ID,
  PLAN_GROCERY_HANDOFF_POLICY_VERSION,
} from '../policy';
import {
  parsePlanGroceryHandoffDecisionEvent,
  toPlanGroceryHandoffEventMetadata,
} from '../events';

const valid = {
  event: 'plan_grocery_generate_committed' as const,
  policyId: PLAN_GROCERY_HANDOFF_POLICY_ID,
  policyVersion: PLAN_GROCERY_HANDOFF_POLICY_VERSION,
  path: 'primary' as const,
  reasonCodes: ['explicit_plan_week_handoff'],
  planId: 'plan-1',
  dateStart: '2026-08-16',
  dateEnd: '2026-08-18',
  plannedMealCount: 3,
  outcome: 'generated' as const,
  clamped: true,
  listId: 'list-1',
  selectionKind: 'generated_exact_range',
};

describe('parsePlanGroceryHandoffDecisionEvent', () => {
  it('accepts structured identifiers and drops meal text from stored metadata', () => {
    const parsed = parsePlanGroceryHandoffDecisionEvent({
      ...valid,
      mealTitle: 'Chicken + rice + broccoli',
    });
    expect(parsed).toEqual(valid);
    const metadata = toPlanGroceryHandoffEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|rice|broccoli|calories|symptom/i);
    expect(metadata.date_start).toBe('2026-08-16');
    expect(metadata.date_end).toBe('2026-08-18');
    expect(metadata.planned_meal_count).toBe(3);
  });

  it('rejects unknown events and policy versions', () => {
    expect(
      parsePlanGroceryHandoffDecisionEvent({ ...valid, event: 'plan_week_generate' }),
    ).toBeNull();
    expect(parsePlanGroceryHandoffDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
    expect(
      parsePlanGroceryHandoffDecisionEvent({
        ...valid,
        event: 'plan_grocery_existing_reused',
        outcome: 'reused',
      }),
    ).not.toBeNull();
  });
});
