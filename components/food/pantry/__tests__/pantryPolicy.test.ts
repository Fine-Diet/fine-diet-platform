import type { PantryAcquisitionLot, PantryOnHandItem } from '@/lib/plans/types';
import {
  expirationEvidence,
  filterAndSortPantryItems,
  sortAcquisitionLots,
} from '../pantryPolicy';

function lot(
  id: string,
  patch: Partial<PantryAcquisitionLot> = {},
): PantryAcquisitionLot {
  return {
    id,
    pantry_item_id: 'pantry-1',
    pantry_item_key: 'food-1::item',
    person_id: 'person-1',
    acquired_on: '2026-09-01',
    expires_on: null,
    expected_shelf_life_days: null,
    quantity_acquired: 1,
    quantity_remaining: 1,
    unit: 'item',
    product_title: null,
    brand_name: null,
    package_size: null,
    package_unit: null,
    package_count: null,
    retailer: null,
    price_amount: null,
    currency: null,
    source_haul_id: null,
    source_haul_item_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...patch,
  };
}

describe('Pantry v2 deterministic policy', () => {
  it('uses exact expiration before deterministic acquired-date shelf-life evidence', () => {
    expect(expirationEvidence(lot('exact', {
      expires_on: '2026-09-05',
      expected_shelf_life_days: 20,
    }))).toEqual({ date: '2026-09-05', kind: 'exact' });
    expect(expirationEvidence(lot('expected', {
      acquired_on: '2026-09-01',
      expected_shelf_life_days: 7,
    }))).toEqual({ date: '2026-09-08', kind: 'expected' });
    expect(expirationEvidence(lot('none'))).toBeNull();
  });

  it('keeps multiple lots distinct and orders active lots before depleted lots', () => {
    const result = sortAcquisitionLots([
      lot('depleted', { quantity_remaining: 0, expires_on: '2026-09-02' }),
      lot('later', { expires_on: '2026-09-10' }),
      lot('nearer', { expires_on: '2026-09-04' }),
    ]);
    expect(result.map((entry) => entry.id)).toEqual(['nearer', 'later', 'depleted']);
  });

  it('filters only on factual expiration and exact aggregate inventory states', () => {
    const items: PantryOnHandItem[] = [
      { key: 'food-1::item', food_object_id: 'food-1', name: 'Spinach', quantity: 1, unit: 'item', updated_at: '2026-09-01' },
      { key: 'food-2::item', food_object_id: 'food-2', name: 'Rice', quantity: 0, unit: 'item', updated_at: '2026-09-01' },
    ];
    const result = filterAndSortPantryItems({
      items,
      lotsByPantryKey: {
        'food-1::item': [lot('spinach', { pantry_item_key: 'food-1::item', expires_on: '2026-09-04' })],
      },
      query: '',
      perishability: 'evidence',
      inventory: 'positive',
    });
    expect(result.map((item) => item.name)).toEqual(['Spinach']);
  });

  it('searches loaded product, brand, and retailer detail without changing data', () => {
    const item: PantryOnHandItem = {
      key: 'food-1::item',
      food_object_id: 'food-1',
      name: 'Chicken',
      quantity: 1,
      unit: 'lb',
      updated_at: '2026-09-01',
    };
    const result = filterAndSortPantryItems({
      items: [item],
      lotsByPantryKey: {
        [item.key]: [lot('product', { product_title: 'Boneless breast', retailer: 'Market A' })],
      },
      query: 'market',
      perishability: 'all',
      inventory: 'all',
    });
    expect(result).toEqual([item]);
  });
});
