import { buildGroceryHaulSummary } from '../groceryHaulSummary';
import type { GroceryItem } from '../types';

jest.mock('../groceryPriceStore', () => ({
  listCurrentObservationsForScope: jest.fn(),
}));

import { listCurrentObservationsForScope } from '../groceryPriceStore';

const mockList = listCurrentObservationsForScope as jest.MockedFunction<
  typeof listCurrentObservationsForScope
>;

const ITEMS: GroceryItem[] = [
  {
    id: 'item-new',
    grocery_list_id: 'list-new',
    person_id: 'person-1',
    name: 'baby spinach',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-1',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
  },
];

describe('groceryHaulSummary regeneration durability', () => {
  it('prices rows by stable match_key after list regeneration', async () => {
    mockList.mockResolvedValue([
      {
        id: 'obs-1',
        person_id: 'person-1',
        grocery_item_id: 'item-old',
        grocery_list_id: 'list-old',
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
        supersedes_observation_id: null,
        created_at: '2026-07-15T00:00:00.000Z',
      },
    ]);

    const summary = await buildGroceryHaulSummary({
      personId: 'person-1',
      groceryListId: 'list-new',
      scope: { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      items: ITEMS,
    });

    expect(summary.priced_item_count).toBe(1);
    expect(summary.estimated_total).toBe(3.99);
    expect(summary.is_incomplete_estimate).toBe(true);
  });
});
