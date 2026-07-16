import {
  runGroceryPricePreviewUiQa,
  type GroceryPricePreviewUiQaDeps,
} from '../groceryPricePreviewUiQaRunner';
import type { GroceryItem } from '../types';

const GROUNDED_ITEM: GroceryItem = {
  id: 'item-grounded',
  grocery_list_id: 'list-1',
  person_id: 'person-1',
  name: 'baby spinach',
  quantity: 2,
  unit: 'cup',
  aisle_category: null,
  food_object_id: 'food-1',
  source_planned_meal_ids: [],
  status: 'pending',
  notes: null,
};

const UNRESOLVED_ITEM: GroceryItem = {
  id: 'item-unresolved',
  grocery_list_id: 'list-1',
  person_id: 'person-1',
  name: 'Steel-cut oats',
  quantity: 1,
  unit: null,
  aisle_category: null,
  food_object_id: null,
  source_planned_meal_ids: [],
  status: 'pending',
  notes: null,
};

function buildDeps(overrides?: Partial<GroceryPricePreviewUiQaDeps>): GroceryPricePreviewUiQaDeps {
  return {
    searchGroceryItemPrices: jest.fn().mockResolvedValue({
      outcome: 'results',
      offers: [{ provider_result_id: 'offer-1' }],
      search_event_id: 'event-1',
      quota: { remaining: 3, upgrade_required: false },
    }),
    confirmSourcedGroceryPrice: jest.fn().mockResolvedValue({
      id: 'obs-sourced',
      source: 'serpapi',
      match_key: 'food-1::cup',
      line_total: 5.5,
    }),
    saveManualGroceryPrice: jest.fn()
      .mockResolvedValueOnce({
        id: 'obs-unresolved-manual',
        source: 'manual',
        match_key: 'steel-cut oats::',
        line_total: 6.75,
      })
      .mockResolvedValueOnce({
        id: 'obs-grounded-manual',
        source: 'manual',
        match_key: 'food-1::cup',
        line_total: 4.25,
      }),
    getGroceryHaulSummaryForList: jest.fn()
      .mockResolvedValueOnce({
        summary: { priced_item_count: 2, estimated_total: 11, manual_subtotal: 11 },
        observations_by_match_key: {},
      })
      .mockResolvedValueOnce({
        summary: { priced_item_count: 2, estimated_total: 11, manual_subtotal: 11 },
        observations_by_match_key: {
          'food-1::cup': { source: 'manual', line_total: 4.25 },
          'steel-cut oats::': { source: 'manual', line_total: 6.75 },
        },
      }),
    loadGroceryItemsForList: jest.fn().mockResolvedValue([GROUNDED_ITEM, UNRESOLVED_ITEM]),
    ...overrides,
  };
}

describe('groceryPricePreviewUiQaRunner', () => {
  it('passes grounded search/confirm, unresolved manual, hydration, and haul updates', async () => {
    const deps = buildDeps();
    const results = await runGroceryPricePreviewUiQa({
      personId: 'person-1',
      groundedItemId: 'item-grounded',
      unresolvedItemId: 'item-unresolved',
      listId: 'list-1',
      deps,
    });

    expect(results.every((result) => result.status === 'pass')).toBe(true);
    expect(results.map((result) => result.name)).toEqual([
      'grounded_search_confirm',
      'unresolved_manual_entry',
      'grounded_manual_entry',
      'haul_summary_updates',
      'refresh_hydration',
      'provider_error_shape',
      'quota_state',
    ]);
  });
});
