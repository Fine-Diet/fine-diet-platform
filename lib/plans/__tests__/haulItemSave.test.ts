import type { GroceryHaulItem } from '@/lib/plans/types';

import { buildHaulItemPreparationPatch } from '@/components/food/hauls/haulItemSave';
import {
  haulDraftFromItem,
  haulSourcedPriceInvalidated,
} from '@/components/food/hauls/haulPurchasingDetails';

function haulItem(overrides: Partial<GroceryHaulItem> = {}): GroceryHaulItem {
  return {
    id: 'haul-item-1',
    haul_id: 'haul-1',
    person_id: 'person-1',
    source_grocery_list_id: 'list-1',
    grocery_item_id: 'grocery-1',
    name_snapshot: 'Spinach',
    quantity_snapshot: 2,
    unit_snapshot: 'cup',
    food_object_id_snapshot: 'food-spinach',
    source_status_snapshot: 'pending',
    source_type_snapshot: 'manual',
    source_id_snapshot: null,
    final_quantity: 2,
    selected_food_object_id: 'food-product',
    product_title: 'Baby Spinach',
    brand_name: 'Organic Girl',
    purchase_unit: 'oz',
    package_size: 5,
    package_unit: 'oz',
    package_count: 1,
    retailer: 'Target',
    store_location: null,
    postal_code: '94107',
    price_amount: 4.99,
    price_currency: 'USD',
    price_source: 'sourced',
    source_purchasing_choice_id: 'choice-1',
    source_price_observation_id: 'price-1',
    resolution_source: 'source_list',
    price_retrieved_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('haul item save patch', () => {
  it('uses source_price_observation_id alone for List quote selection', () => {
    const item = haulItem();
    const draft = haulDraftFromItem(item);
    draft.pendingSourcePriceObservationId = 'price-2';
    expect(buildHaulItemPreparationPatch(item, draft)).toEqual({
      source_price_observation_id: 'price-2',
    });
  });

  it('omits stale sourced price when trip-prep context changes', () => {
    const item = haulItem();
    const draft = haulDraftFromItem(item);
    draft.retailer = 'Whole Foods';
    expect(haulSourcedPriceInvalidated(item, draft)).toBe(true);
    const patch = buildHaulItemPreparationPatch(item, draft);
    expect(patch).toEqual({ retailer: 'Whole Foods' });
    expect(patch).not.toHaveProperty('price_amount');
  });

  it('persists manual price without final_quantity', () => {
    const item = haulItem({ price_source: 'manual', source_price_observation_id: null });
    const draft = haulDraftFromItem(item);
    draft.priceAmount = '6.25';
    const patch = buildHaulItemPreparationPatch(item, draft);
    expect(patch).toEqual({
      price_amount: 6.25,
      price_currency: 'USD',
    });
    expect(patch).not.toHaveProperty('final_quantity');
  });
});
