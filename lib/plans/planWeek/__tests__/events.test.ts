import { PLAN_WEEK_POLICY_ID, PLAN_WEEK_POLICY_VERSION } from '../policy';
import { parsePlanWeekDecisionEvent, toPlanWeekEventMetadata } from '../events';

const valid = {
  event: 'plan_week_shown',
  policyId: PLAN_WEEK_POLICY_ID,
  policyVersion: PLAN_WEEK_POLICY_VERSION,
  path: 'exposed',
  reasonCodes: ['week_remaining_open_occasions'],
  openCount: 4,
  plannedCount: 2,
  attachableOpenCount: 3,
  date: '2026-08-17',
  slotKey: 'lunch',
  canAttach: true,
};

describe('parsePlanWeekDecisionEvent', () => {
  it('accepts structured identifiers and drops meal text from stored metadata', () => {
    const parsed = parsePlanWeekDecisionEvent({
      ...valid,
      mealTitle: 'Chicken + rice + broccoli',
    });
    expect(parsed).toEqual(valid);
    const metadata = toPlanWeekEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|rice|broccoli|calories|symptom/i);
  });

  it('rejects unknown events, policy versions, and generate-style names', () => {
    expect(parsePlanWeekDecisionEvent({ ...valid, event: 'plan_week_generate' })).toBeNull();
    expect(parsePlanWeekDecisionEvent({ ...valid, event: 'plan_week_repeat_applied' })).toBeNull();
    expect(parsePlanWeekDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
    expect(parsePlanWeekDecisionEvent({ ...valid, date: '08/17/2026' })).toBeNull();
  });
});
