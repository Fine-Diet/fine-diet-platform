import { buildGroceryHaulSummary } from '../groceryHaulSummary';
import type { GroceryItem } from '../types';
import type { GroceryPriceObservation } from '../groceryPricingTypes';

jest.mock('../groceryPriceStore', () => ({
  listGroceryPriceObservationsForList: jest.fn(),
}));

import { listGroceryPriceObservationsForList } from '../groceryPriceStore';

const mockListObservations = listGroceryPriceObservationsForList as jest.MockedFunction<
  typeof listGroceryPriceObservationsForList
>;

const ITEMS: GroceryItem[] = [
  {
    id: 'item-1',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'spinach',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-1',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
  },
  {
    id: 'item-2',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'yogurt',
    quantity: 1,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-2',
    source_planned_meal_ids: [],
    status: 'skipped',
    notes: null,
  },
];

describe('groceryHaulSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes subtotals, coverage, and incomplete estimate state', async () => {
    const observations: GroceryPriceObservation[] = [
      {
        id: 'obs-1',
        person_id: 'person-1',
        grocery_item_id: 'item-1',
        grocery_list_id: 'list-1',
        plan_id: 'plan-1',
        date_range_start: '2026-07-15',
        date_range_end: '2026-07-15',
        match_key: 'food-1::cup',
        food_object_id: 'food-1',
        source: 'manual',
        retailer: 'Whole Foods Market',
        postal_code: '94110',
        product_title: 'Organic Girl Baby Spinach',
        brand_name: 'Organic Girl',
        package_size: null,
        package_unit: null,
        unit_price: 3.99,
        currency: 'USD',
        package_count: 1,
        line_total: 3.99,
        product_url: null,
        image_url: null,
        provider_result_id: null,
        search_event_id: null,
        retrieved_at: '2026-07-15T00:00:00.000Z',
        match_confidence: null,
        user_confirmed: true,
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:00:00.000Z',
      },
    ];
    mockListObservations.mockResolvedValue(observations);

    const summary = await buildGroceryHaulSummary({
      personId: 'person-1',
      groceryListId: 'list-1',
      items: ITEMS,
    });

    expect(summary).toMatchObject({
      estimated_total: 3.99,
      manual_subtotal: 3.99,
      sourced_subtotal: 0,
      priced_item_count: 1,
      eligible_item_count: 1,
      unpriced_item_count: 0,
      priced_coverage_percent: 100,
      is_incomplete_estimate: true,
    });
    expect(summary.confidence_summary).toContain('Incomplete estimate');
  });
});
