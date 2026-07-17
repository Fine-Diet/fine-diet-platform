import { groceryItemMatchKey } from '../groceryMatchKeys';
import {
  detachPriceObservationForItem,
  mapPriceObservationsToGroceryItems,
  observationsByMatchKeyFromList,
} from '../groceryPricingObservations';
import type { GroceryPriceObservation } from '../groceryPricingTypes';
import type { GroceryItem } from '../types';

const ITEMS: GroceryItem[] = [
  {
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
  },
  {
    id: 'item-unresolved',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'Fresh Basil',
    quantity: 1,
    unit: 'cup',
    aisle_category: null,
    food_object_id: null,
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
  },
];

function observation(
  overrides: Partial<GroceryPriceObservation> & Pick<GroceryPriceObservation, 'match_key' | 'source'>,
): GroceryPriceObservation {
  return {
    id: overrides.id ?? 'obs-1',
    person_id: 'person-1',
    grocery_item_id: overrides.grocery_item_id ?? null,
    grocery_list_id: 'list-1',
    plan_id: 'plan-1',
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-15',
    match_key: overrides.match_key,
    food_object_id: overrides.food_object_id ?? null,
    source: overrides.source,
    retailer: overrides.retailer ?? 'Target',
    postal_code: overrides.postal_code ?? '94110',
    product_title: overrides.product_title ?? 'Product',
    brand_name: overrides.brand_name ?? null,
    package_size: overrides.package_size ?? null,
    package_unit: overrides.package_unit ?? null,
    unit_price: overrides.unit_price ?? 3.99,
    currency: overrides.currency ?? 'USD',
    package_count: overrides.package_count ?? 1,
    line_total: overrides.line_total ?? 3.99,
    product_url: overrides.product_url ?? null,
    image_url: overrides.image_url ?? null,
    provider_result_id: overrides.provider_result_id ?? null,
    search_event_id: overrides.search_event_id ?? null,
    retrieved_at: overrides.retrieved_at ?? '2026-07-15T00:00:00.000Z',
    match_confidence: overrides.match_confidence ?? null,
    user_confirmed: overrides.user_confirmed ?? true,
    supersedes_observation_id: overrides.supersedes_observation_id ?? null,
    created_at: overrides.created_at ?? '2026-07-15T00:00:00.000Z',
  };
}

describe('groceryPricingObservations', () => {
  it('maps observations onto grounded and unresolved rows by match key', () => {
    const groundedKey = groceryItemMatchKey(ITEMS[0]);
    const unresolvedKey = groceryItemMatchKey(ITEMS[1]);
    const byMatchKey = observationsByMatchKeyFromList([
      observation({ match_key: groundedKey, source: 'serpapi', line_total: 4.5 }),
      observation({ match_key: unresolvedKey, source: 'manual', line_total: 2.25 }),
    ]);

    const mapped = mapPriceObservationsToGroceryItems(ITEMS, byMatchKey);
    expect(mapped['item-grounded']?.line_total).toBe(4.5);
    expect(mapped['item-unresolved']?.source).toBe('manual');
  });

  it('keeps manual observation when it is the latest match-key entry', () => {
    const matchKey = groceryItemMatchKey(ITEMS[0]);
    const byMatchKey = observationsByMatchKeyFromList([
      observation({
        id: 'obs-manual',
        match_key: matchKey,
        source: 'manual',
        line_total: 5,
        created_at: '2026-07-16T00:00:00.000Z',
      }),
    ]);

    expect(byMatchKey[matchKey]?.source).toBe('manual');
    expect(mapPriceObservationsToGroceryItems([ITEMS[0]], byMatchKey)['item-grounded']?.line_total).toBe(5);
  });

  it('detaches an item-keyed manual observation immediately when resolution changes identity', () => {
    const unresolvedKey = groceryItemMatchKey(ITEMS[1]);
    const manual = observation({
      id: 'obs-unresolved-manual',
      grocery_item_id: ITEMS[1].id,
      match_key: unresolvedKey,
      source: 'manual',
    });
    const current = {
      [ITEMS[1].id]: manual,
      [ITEMS[0].id]: observation({
        id: 'obs-grounded',
        grocery_item_id: ITEMS[0].id,
        match_key: groceryItemMatchKey(ITEMS[0]),
        source: 'serpapi',
      }),
    };

    expect(detachPriceObservationForItem(current, ITEMS[1].id)).toEqual({
      [ITEMS[0].id]: current[ITEMS[0].id],
    });
  });
});
