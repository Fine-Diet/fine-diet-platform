import { PLAN_TODAY_POLICY_ID, PLAN_TODAY_POLICY_VERSION } from '../policy';
import { parsePlanTodayDecisionEvent, toPlanTodayEventMetadata } from '../events';

const valid = {
  event: 'plan_today_shown',
  policyId: PLAN_TODAY_POLICY_ID,
  policyVersion: PLAN_TODAY_POLICY_VERSION,
  path: 'exposed',
  reasonCodes: ['today_remaining_open_occasions'],
  openCount: 2,
  plannedCount: 1,
  slotKey: 'lunch',
  canAttach: true,
};

describe('parsePlanTodayDecisionEvent', () => {
  it('accepts structured identifiers and drops meal text from stored metadata', () => {
    const parsed = parsePlanTodayDecisionEvent({
      ...valid,
      mealTitle: 'Chicken + rice + broccoli',
    });
    expect(parsed).toEqual(valid);
    const metadata = toPlanTodayEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|rice|broccoli|calories|symptom/i);
  });

  it('rejects unknown events and policy versions', () => {
    expect(parsePlanTodayDecisionEvent({ ...valid, event: 'plan_week_generate' })).toBeNull();
    expect(parsePlanTodayDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
  });
});
