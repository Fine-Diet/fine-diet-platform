import {
  GROCERY_LIST_READINESS_POLICY_ID,
  GROCERY_LIST_READINESS_POLICY_VERSION,
} from '../policy';
import {
  parseGroceryListReadinessDecisionEvent,
  toGroceryListReadinessEventMetadata,
} from '../events';

const valid = {
  event: 'grocery_list_ready_to_shop' as const,
  policyId: GROCERY_LIST_READINESS_POLICY_ID,
  policyVersion: GROCERY_LIST_READINESS_POLICY_VERSION,
  path: 'primary' as const,
  reasonCodes: ['pending_items_remain', 'pricing_optional'],
  listId: 'list-1',
  planId: 'plan-1',
  readinessState: 'ready_to_shop' as const,
  pendingCount: 8,
  pricedItemCount: 0,
  unresolvedCount: 0,
};

describe('parseGroceryListReadinessDecisionEvent', () => {
  it('accepts structured identifiers and drops grocery item names from metadata', () => {
    const parsed = parseGroceryListReadinessDecisionEvent({
      ...valid,
      itemName: 'Organic chicken thighs',
    });
    expect(parsed).toEqual(valid);
    const metadata = toGroceryListReadinessEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|organic|thighs/i);
    expect(metadata.list_id).toBe('list-1');
    expect(metadata.priced_item_count).toBe(0);
    expect(metadata.readiness_state).toBe('ready_to_shop');
  });

  it('rejects unknown events and policy versions', () => {
    expect(
      parseGroceryListReadinessDecisionEvent({ ...valid, event: 'grocery_list_haul_created' }),
    ).toBeNull();
    expect(parseGroceryListReadinessDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
    expect(
      parseGroceryListReadinessDecisionEvent({
        ...valid,
        event: 'grocery_list_pull_from_plan_committed',
      }),
    ).not.toBeNull();
  });
});
