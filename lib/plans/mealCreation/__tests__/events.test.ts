import {
  MEAL_CREATION_POLICY_ID,
  MEAL_CREATION_POLICY_VERSION,
} from '../candidatePolicy';
import { parseMealCreationDecisionEvent, toMealCreationEventMetadata } from '../events';

const valid = {
  event: 'meal_creation_candidates_shown',
  policyId: MEAL_CREATION_POLICY_ID,
  policyVersion: MEAL_CREATION_POLICY_VERSION,
  path: 'exposed',
  reasonCodes: ['saved_library_candidates'],
  candidateCount: 2,
  slotKey: 'lunch',
  selectedSource: null,
  attached: false,
};

describe('parseMealCreationDecisionEvent', () => {
  it('accepts structured identifiers and drops meal text from stored metadata', () => {
    const parsed = parseMealCreationDecisionEvent({
      ...valid,
      mealTitle: 'Chicken + rice + broccoli',
    });
    expect(parsed).toEqual(valid);
    const metadata = toMealCreationEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|rice|broccoli|calories|symptom/i);
  });

  it('rejects unknown events and policy versions', () => {
    expect(parseMealCreationDecisionEvent({ ...valid, event: 'meal_dump' })).toBeNull();
    expect(parseMealCreationDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
  });
});
