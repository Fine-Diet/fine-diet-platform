import { evaluateGroceryListReadiness } from '@/lib/plans/groceryListReadiness/policy';
import type { GroceryItem } from '@/lib/plans/types';
import { resolveGroceryHaulCreateEligibility } from '../eligibility';

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

describe('resolveGroceryHaulCreateEligibility', () => {
  it('allows ready_to_shop and shopping_in_progress when the list is active', () => {
    const ready = evaluateGroceryListReadiness({ items: [item()] });
    expect(ready.state).toBe('ready_to_shop');
    expect(resolveGroceryHaulCreateEligibility({ readinessState: ready.state })).toEqual({
      eligible: true,
    });

    const inProgress = evaluateGroceryListReadiness({
      items: [item(), item({ id: 'item-2', status: 'bought' })],
    });
    expect(inProgress.state).toBe('shopping_in_progress');
    expect(
      resolveGroceryHaulCreateEligibility({ readinessState: inProgress.state }),
    ).toEqual({ eligible: true });
  });

  it('blocks empty, unresolved, complete, and archived lists even with pending demand', () => {
    expect(
      resolveGroceryHaulCreateEligibility({
        readinessState: evaluateGroceryListReadiness({ items: [] }).state,
      }),
    ).toEqual({ eligible: false, blockReason: 'empty_or_no_demand' });

    expect(
      resolveGroceryHaulCreateEligibility({
        readinessState: evaluateGroceryListReadiness({
          items: [item({ food_object_id: null })],
        }).state,
      }),
    ).toEqual({ eligible: false, blockReason: 'needs_resolution' });

    expect(
      resolveGroceryHaulCreateEligibility({
        readinessState: evaluateGroceryListReadiness({
          items: [item({ status: 'bought' })],
        }).state,
      }),
    ).toEqual({ eligible: false, blockReason: 'complete_or_closed' });

    expect(
      resolveGroceryHaulCreateEligibility({
        archivedAt: '2026-08-18T00:00:00.000Z',
        readinessState: 'ready_to_shop',
      }),
    ).toEqual({ eligible: false, blockReason: 'archived' });
  });

  it('does not use pricing completeness as a gate', () => {
    const unpriced = evaluateGroceryListReadiness({
      items: [item()],
      pricedItemCount: 0,
    });
    expect(unpriced.state).toBe('ready_to_shop');
    expect(unpriced.reasonCodes).toContain('pricing_optional');
    expect(resolveGroceryHaulCreateEligibility({ readinessState: unpriced.state })).toEqual({
      eligible: true,
    });
  });
});
