import { PLAN_REPEAT_POLICY_ID, PLAN_REPEAT_POLICY_VERSION } from '../policy';
import { parsePlanRepeatDecisionEvent, toPlanRepeatEventMetadata } from '../events';

const valid = {
  event: 'plan_repeat_committed' as const,
  policyId: PLAN_REPEAT_POLICY_ID,
  policyVersion: PLAN_REPEAT_POLICY_VERSION,
  path: 'primary' as const,
  reasonCodes: ['repeat_committed'],
  planId: 'plan-1',
  sourcePlannedMealId: 'meal-1',
  sourceMealDocumentId: 'doc-1',
  dateLocal: '2026-08-17',
  slotKey: 'lunch',
  selected: false,
  destinationCount: 2,
  attachedCount: 2,
  reusedCount: 0,
  occupiedSkippedCount: 0,
  invalidCount: 0,
  failedCount: 0,
  partial: false,
};

describe('parsePlanRepeatDecisionEvent', () => {
  it('accepts structured identifiers and drops meal text from stored metadata', () => {
    const parsed = parsePlanRepeatDecisionEvent({
      ...valid,
      mealTitle: 'Chicken + rice + broccoli',
    });
    expect(parsed).toEqual(valid);
    const metadata = toPlanRepeatEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|rice|broccoli|calories|symptom/i);
  });

  it('rejects unknown events and policy versions', () => {
    expect(parsePlanRepeatDecisionEvent({ ...valid, event: 'plan_week_generate' })).toBeNull();
    expect(parsePlanRepeatDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
    expect(
      parsePlanRepeatDecisionEvent({ ...valid, event: 'plan_repeat_destination_toggled' }),
    ).not.toBeNull();
  });
});
