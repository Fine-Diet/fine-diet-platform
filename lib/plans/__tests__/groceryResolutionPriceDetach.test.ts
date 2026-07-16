import { mapPriceObservationsToGroceryItems } from '../groceryPricingObservations';
import type { GroceryPriceObservation } from '../groceryPricingTypes';
import type { GroceryItem } from '../types';

describe('mapPriceObservationsToGroceryItems after resolution change', () => {
  it('detaches stale old-identity observations from the corrected row', () => {
    const item: GroceryItem = {
      id: 'item-1',
      grocery_list_id: 'list-1',
      person_id: 'person-1',
      name: 'baby spinach',
      quantity: 2,
      unit: 'cup',
      aisle_category: null,
      food_object_id: 'food-2',
      source_planned_meal_ids: ['meal-1'],
      status: 'pending',
      notes: null,
    };
    const observationsByMatchKey: Record<string, GroceryPriceObservation> = {
      'food-1::cup': {
        id: 'obs-old',
        person_id: 'person-1',
        grocery_item_id: 'item-1',
        grocery_list_id: 'list-1',
        plan_id: 'plan-1',
        date_range_start: '2026-07-15',
        date_range_end: '2026-07-15',
        match_key: 'food-1::cup',
        food_object_id: 'food-1',
        source: 'manual',
        retailer: 'Target',
        postal_code: null,
        product_title: 'Old Spinach',
        brand_name: null,
        package_size: null,
        package_unit: null,
        unit_price: 3.5,
        currency: 'USD',
        package_count: 1,
        line_total: 3.5,
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
    };

    expect(mapPriceObservationsToGroceryItems([item], observationsByMatchKey)).toEqual({});
  });
});
