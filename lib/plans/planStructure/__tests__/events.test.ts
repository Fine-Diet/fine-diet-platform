import { PLAN_STRUCTURE_POLICY_ID, PLAN_STRUCTURE_POLICY_VERSION } from '../policy';
import {
  parsePlanStructureDecisionEvent,
  toPlanStructureEventMetadata,
} from '../events';

const valid = {
  event: 'plan_structure_ensure_succeeded',
  policyId: PLAN_STRUCTURE_POLICY_ID,
  policyVersion: PLAN_STRUCTURE_POLICY_VERSION,
  path: 'primary',
  reasonCodes: ['canonical_structure_reused'],
  planId: 'plan-1',
  dateLocal: '2026-08-16',
  slotKey: 'lunch',
  createdDay: false,
  createdSlot: false,
  reused: true,
};

describe('parsePlanStructureDecisionEvent', () => {
  it('accepts structured identifiers and drops meal text from stored metadata', () => {
    const parsed = parsePlanStructureDecisionEvent({
      ...valid,
      mealTitle: 'Chicken + rice + broccoli',
    });
    expect(parsed).toEqual(valid);
    const metadata = toPlanStructureEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|rice|broccoli|calories|symptom/i);
  });

  it('rejects unknown events and policy versions', () => {
    expect(parsePlanStructureDecisionEvent({ ...valid, event: 'plan_week_generate' })).toBeNull();
    expect(parsePlanStructureDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
    expect(parsePlanStructureDecisionEvent({ ...valid, dateLocal: '08/16/2026' })).toBeNull();
  });
});
