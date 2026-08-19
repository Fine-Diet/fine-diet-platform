import {
  GROCERIES_INDEX_SUPPORTING_COPY,
  GROCERIES_INDEX_TITLE,
  GROCERIES_LISTS_SECTION_HEADING,
  GROCERIES_HAULS_SECTION_HEADING,
  formatGroceryListReadinessCopy,
  formatGroceryShoppingStatusLabel,
  groceryListReadinessHeadline,
  groceryListReadinessIndexCtaLabel,
} from '../copy';
import { evaluateGroceryListReadiness } from '../policy';
import type { GroceryItem } from '@/lib/plans/types';
import type { GroceryListReadinessState } from '../policy';

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
      'Nothing on this list yet.',
    );
    expect(
      formatGroceryListReadinessCopy(
        evaluateGroceryListReadiness({ items: [item({ status: 'bought' })] }),
      ),
    ).toBe('Nothing left on this list.');
  });

  it('says pending items remain with optional pricing for ready state', () => {
    const copy = formatGroceryListReadinessCopy(
      evaluateGroceryListReadiness({
        items: Array.from({ length: 8 }, (_, i) => item({ id: `item-${i}` })),
        pricedItemCount: 0,
      }),
    );
    expect(copy).toContain('8 items remain');
    expect(copy).toContain('Pricing is optional');
    expect(copy).not.toMatch(/haul|retailer|priced/i);
  });

  it('shopping_in_progress copy does not say Shopping in progress (Packet 11E)', () => {
    const decision = evaluateGroceryListReadiness({
      items: [item(), item({ id: 'item-2', status: 'bought' })],
    });
    expect(decision.state).toBe('shopping_in_progress');
    const copy = formatGroceryListReadinessCopy(decision);
    expect(copy.toLowerCase()).not.toContain('shopping in progress');
    expect(copy).toContain('still on the list');
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

  it('Packet 11E — all index CTAs are Open List', () => {
    const states: GroceryListReadinessState[] = [
      'empty_or_no_demand',
      'needs_resolution',
      'ready_to_shop',
      'shopping_in_progress',
      'complete_or_closed',
    ];
    for (const state of states) {
      const cta = groceryListReadinessIndexCtaLabel(state);
      expect(cta).toBe('Open List');
      expect(cta).not.toMatch(/continue shopping trip/i);
      expect(cta).not.toMatch(/haul/i);
    }
  });

  it('Packet 11E — headlines neutral (no Haul language, shopping_in_progress → In progress)', () => {
    expect(groceryListReadinessHeadline('shopping_in_progress')).toBe('In progress');
    expect(groceryListReadinessHeadline('empty_or_no_demand')).toBe('No items yet');
    expect(groceryListReadinessHeadline('needs_resolution')).toBe('Needs attention');
    expect(groceryListReadinessHeadline('ready_to_shop')).toBe('Ready to shop');
    expect(groceryListReadinessHeadline('complete_or_closed')).toBe('List complete');

    const states: GroceryListReadinessState[] = [
      'empty_or_no_demand',
      'needs_resolution',
      'ready_to_shop',
      'shopping_in_progress',
      'complete_or_closed',
    ];
    for (const state of states) {
      expect(groceryListReadinessHeadline(state).toLowerCase()).not.toContain('haul');
    }
  });

  it('Packet 11E constants', () => {
    expect(GROCERIES_INDEX_TITLE).toBe('Groceries');
    expect(GROCERIES_INDEX_SUPPORTING_COPY).toContain('build a Haul');
    expect(GROCERIES_INDEX_SUPPORTING_COPY).not.toContain('Shopping trip');
    expect(GROCERIES_LISTS_SECTION_HEADING).toBe('Grocery Lists');
    expect(GROCERIES_HAULS_SECTION_HEADING).toBe('Hauls');
  });
});
