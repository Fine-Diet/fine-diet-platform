import {
  PANTRY_QUICK_START_POLICY_ID,
  PANTRY_QUICK_START_POLICY_VERSION,
} from '../catalog';
import {
  parsePantryQuickStartDecisionEvent,
  toPantryQuickStartEventMetadata,
} from '../events';

const valid = {
  event: 'pantry_quick_start_proposal_shown',
  policyId: PANTRY_QUICK_START_POLICY_ID,
  policyVersion: PANTRY_QUICK_START_POLICY_VERSION,
  proposalSource: 'product_default',
  path: 'exposed',
  reasonCodes: ['product_default_assumption'],
  acceptedCount: 4,
  skippedCategoryCount: 1,
  alreadySavedCount: 0,
  stapleId: null,
  categoryId: null,
};

describe('parsePantryQuickStartDecisionEvent', () => {
  it('accepts structured identifiers and drops food free text from stored metadata', () => {
    const parsed = parsePantryQuickStartDecisionEvent({
      ...valid,
      foodName: 'Olive oil extra virgin',
    });
    expect(parsed).toEqual(valid);
    const metadata = toPantryQuickStartEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/olive oil extra virgin/i);
    expect(metadata.staple_id).toBeNull();
    expect(metadata.accepted_count).toBe(4);
  });

  it('rejects unknown events, sources, and policy versions', () => {
    expect(parsePantryQuickStartDecisionEvent({ ...valid, event: 'pantry_dump' })).toBeNull();
    expect(parsePantryQuickStartDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
    expect(
      parsePantryQuickStartDecisionEvent({ ...valid, proposalSource: 'purchase_history' }),
    ).toBeNull();
  });
});
