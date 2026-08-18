import { formatGroceryListReadinessCopy, formatGroceryShoppingStatusLabel } from '../copy';
import { evaluateGroceryListReadiness } from '../policy';
import type { GroceryItem } from '@/lib/plans/types';

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

describe('grocery list readiness copy', () => {
  it('explains empty and complete lists without implying a Haul', () => {
    expect(formatGroceryListReadinessCopy(evaluateGroceryListReadiness({ items: [] }))).toBe(
      'Nothing to shop yet on this list.',
    );
    expect(
      formatGroceryListReadinessCopy(
        evaluateGroceryListReadiness({ items: [item({ status: 'bought' })] }),
      ),
    ).toBe('Nothing left to buy on this list.');
  });

  it('says ready to shop with remaining items and optional pricing', () => {
    const copy = formatGroceryListReadinessCopy(
      evaluateGroceryListReadiness({
        items: Array.from({ length: 8 }, (_, i) => item({ id: `item-${i}` })),
        pricedItemCount: 0,
      }),
    );
    expect(copy).toBe('Ready to shop — 8 items remain. Pricing is optional.');
    expect(copy).not.toMatch(/haul|retailer|priced/i);
  });

  it('names unresolved identity as the blocker', () => {
    const copy = formatGroceryListReadinessCopy(
      evaluateGroceryListReadiness({
        items: [
          item({ food_object_id: null }),
          item({ id: 'item-2', food_object_id: null }),
          item({ id: 'item-3', food_object_id: null }),
        ],
      }),
    );
    expect(copy).toBe('3 items still need ingredient identity before reliable shopping support.');
  });

  it('labels explicit shopping statuses', () => {
    expect(formatGroceryShoppingStatusLabel('pending')).toBe('Need to buy');
    expect(formatGroceryShoppingStatusLabel('bought')).toBe('Bought');
    expect(formatGroceryShoppingStatusLabel('have')).toBe('Already have');
    expect(formatGroceryShoppingStatusLabel('skipped')).toBe('Skipped');
  });
});
