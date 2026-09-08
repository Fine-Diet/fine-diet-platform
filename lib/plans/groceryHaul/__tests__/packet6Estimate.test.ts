import type { GroceryHaulItem } from '@/lib/plans/types';
import { computeGroceryHaulPreparationEstimate } from '../estimate';

function item(overrides: Partial<GroceryHaulItem> = {}): GroceryHaulItem {
  return {
    id: 'item-1',
    haul_id: 'haul-1',
    person_id: 'person-1',
    source_grocery_list_id: 'list-1',
    grocery_item_id: 'source-item-1',
    name_snapshot: 'Oats',
    quantity_snapshot: 2,
    unit_snapshot: 'cup',
    food_object_id_snapshot: 'food-oats',
    source_status_snapshot: 'pending',
    source_type_snapshot: 'manual',
    source_id_snapshot: null,
    final_quantity: 2,
    selected_food_object_id: 'product-oats',
    product_title: 'Rolled oats',
    brand_name: 'Mill',
    purchase_unit: 'package',
    package_size: 18,
    package_unit: 'oz',
    package_count: 1,
    retailer: 'Market',
    store_location: 'Downtown',
    postal_code: '60601',
    price_amount: 3.25,
    price_currency: 'USD',
    price_source: 'sourced',
    source_purchasing_choice_id: 'choice-1',
    source_price_observation_id: 'price-1',
    resolution_source: 'source_list',
    price_retrieved_at: '2026-09-08T00:00:00.000Z',
    created_at: '2026-09-08T00:00:00.000Z',
    updated_at: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('Packet 6 persisted Haul estimate', () => {
  it('uses final quantity, excludes zero, preserves manual authority, and groups by store', () => {
    const source = item();
    const manual = item({
      id: 'item-2',
      grocery_item_id: 'source-item-2',
      name_snapshot: 'Milk',
      quantity_snapshot: 9,
      final_quantity: 3,
      price_amount: 2,
      price_source: 'manual',
      resolution_source: 'haul_edit',
    });
    const excluded = item({
      id: 'item-3',
      grocery_item_id: 'source-item-3',
      quantity_snapshot: 7,
      final_quantity: 0,
      price_amount: 100,
      price_source: 'manual',
    });

    const estimate = computeGroceryHaulPreparationEstimate('USD', [
      source,
      manual,
      excluded,
    ]);

    expect(estimate).toMatchObject({
      estimated_total: 12.5,
      manual_subtotal: 6,
      sourced_subtotal: 6.5,
      execution_item_count: 2,
      excluded_item_count: 1,
      priced_item_count: 2,
      unpriced_item_count: 0,
      estimated_tax: null,
      tax_status: 'excluded',
    });
    expect(estimate.by_store).toEqual([
      expect.objectContaining({ estimated_subtotal: 12.5, priced_item_count: 2 }),
    ]);
    expect(source.quantity_snapshot).toBe(2);
    expect(manual.quantity_snapshot).toBe(9);
  });

  it('treats missing or foreign-currency prices as unpriced deterministically', () => {
    const estimate = computeGroceryHaulPreparationEstimate('USD', [
      item({ price_amount: null, price_currency: null, price_source: null }),
      item({
        id: 'item-2',
        grocery_item_id: 'source-item-2',
        price_currency: 'CAD',
      }),
    ]);
    expect(estimate.estimated_total).toBe(0);
    expect(estimate.priced_item_count).toBe(0);
    expect(estimate.unpriced_item_count).toBe(2);
  });
});
