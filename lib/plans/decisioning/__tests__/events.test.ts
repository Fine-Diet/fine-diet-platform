import { PLANS_NBA_RESOLVER_VERSION } from '../types';
import { parsePlansDecisionEvent, toPeopleEventMetadata } from '../events';

const valid = {
  event: 'plans_nba_exposed',
  resolverVersion: PLANS_NBA_RESOLVER_VERSION,
  stateKey: 'plan_today',
  primaryActionId: 'plan_today',
  path: 'exposed',
  reasonCodes: ['today_empty'],
  confidence: 'deterministic',
};

describe('parsePlansDecisionEvent', () => {
  it('accepts structured identifier payloads', () => {
    expect(parsePlansDecisionEvent(valid)).toEqual({
      ...valid,
      takenActionId: undefined,
    });
  });

  it('rejects unknown event names and free-form extras as the contract', () => {
    expect(parsePlansDecisionEvent({ ...valid, event: 'custom_meal_dump' })).toBeNull();
    expect(parsePlansDecisionEvent({ ...valid, stateKey: 'not_a_state' })).toBeNull();
    expect(parsePlansDecisionEvent({ ...valid, resolverVersion: 'v0' })).toBeNull();
  });

  it('maps to people_events metadata without meal text fields', () => {
    const parsed = parsePlansDecisionEvent({
      ...valid,
      event: 'plans_nba_action_taken',
      takenActionId: 'plan_without_pantry',
      path: 'secondary',
    });
    expect(parsed).not.toBeNull();
    const metadata = toPeopleEventMetadata(parsed!);
    expect(metadata.decision_event).toBe('plans_nba_action_taken');
    expect(JSON.stringify(metadata)).not.toMatch(/oats|calories|symptom/i);
  });
});
