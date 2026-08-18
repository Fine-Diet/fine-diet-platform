import type { GroceryItem } from '@/lib/plans/types';
import {
  GROCERY_LIST_READINESS_POLICY_ID,
  GROCERY_LIST_READINESS_POLICY_VERSION,
  evaluateGroceryListReadiness,
} from '../policy';

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'item-1',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'Oats',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-oats',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('evaluateGroceryListReadiness', () => {
  it('classifies an empty list as empty_or_no_demand', () => {
    const decision = evaluateGroceryListReadiness({ items: [] });
    expect(decision.policyId).toBe(GROCERY_LIST_READINESS_POLICY_ID);
    expect(decision.policyVersion).toBe(GROCERY_LIST_READINESS_POLICY_VERSION);
    expect(decision.state).toBe('empty_or_no_demand');
    expect(decision.reasonCodes).toContain('empty_list');
    expect(decision.reasonCodes).toContain('pricing_optional');
  });

  it('is ready_to_shop with pending unpriced items', () => {
    const decision = evaluateGroceryListReadiness({
      items: [item(), item({ id: 'item-2', name: 'Milk', food_object_id: 'food-milk' })],
      pricedItemCount: 0,
      stalePriceCount: 0,
    });
    expect(decision.state).toBe('ready_to_shop');
    expect(decision.counts.pending).toBe(2);
    expect(decision.reasonCodes).toContain('pricing_optional');
    expect(decision.reasonCodes).toContain('pricing_absent');
    expect(decision.reasonCodes).not.toContain('unresolved_identity');
  });

  it('does not let stale or partial pricing block ready_to_shop', () => {
    const decision = evaluateGroceryListReadiness({
      items: [item(), item({ id: 'item-2', food_object_id: 'food-milk' })],
      pricedItemCount: 1,
      stalePriceCount: 1,
    });
    expect(decision.state).toBe('ready_to_shop');
    expect(decision.reasonCodes).toContain('pricing_partial');
    expect(decision.reasonCodes).toContain('pricing_stale');
    expect(decision.reasonCodes).toContain('pricing_optional');
  });

  it('needs_resolution when pending rows lack ingredient identity', () => {
    const decision = evaluateGroceryListReadiness({
      items: [item({ food_object_id: null }), item({ id: 'item-2' })],
    });
    expect(decision.state).toBe('needs_resolution');
    expect(decision.counts.pendingUnresolvedIdentity).toBe(1);
    expect(decision.reasonCodes).toContain('unresolved_identity');
  });

  it('needs_resolution when pending rows have an unsafe amount', () => {
    const decision = evaluateGroceryListReadiness({
      items: [item({ quantity: null })],
    });
    expect(decision.state).toBe('needs_resolution');
    expect(decision.reasonCodes).toContain('unsafe_amount');
  });

  it('interprets bought/have/skipped as explicit shopping state, not inferred coverage', () => {
    const complete = evaluateGroceryListReadiness({
      items: [
        item({ status: 'bought' }),
        item({ id: 'item-2', status: 'have' }),
        item({ id: 'item-3', status: 'skipped' }),
      ],
    });
    expect(complete.state).toBe('complete_or_closed');
    expect(complete.counts.pending).toBe(0);
    expect(complete.counts.bought).toBe(1);
    expect(complete.counts.have).toBe(1);
    expect(complete.counts.skipped).toBe(1);

    const inProgress = evaluateGroceryListReadiness({
      items: [item({ status: 'bought' }), item({ id: 'item-2', status: 'pending' })],
    });
    expect(inProgress.state).toBe('shopping_in_progress');
    expect(inProgress.reasonCodes).toContain('explicit_shopping_progress');
  });

  it('does not infer have or complete from pantry or priced coverage', () => {
    const decision = evaluateGroceryListReadiness({
      items: [item({ status: 'pending' })],
      pricedItemCount: 1,
    });
    expect(decision.state).toBe('ready_to_shop');
    expect(decision.reasonCodes).toContain('pantry_presentation_only');
    expect(decision.counts.have).toBe(0);
  });
});
