import type { PantryAcquisitionLot, PantryOnHandItem } from '@/lib/plans/types';
import {
  activeAcquisitionLots,
  earliestActiveExpirationEvidence,
  expirationEvidence,
  expirationEvidenceTense,
  filterAndSortPantryItems,
  formatExpirationEvidenceLabel,
  formatPurchaseStateLabel,
  parentExpirationShortState,
  sortPurchaseHistoryLots,
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

  it('sorts purchase history newest acquired date first with created_at tie-break', () => {
    const result = sortPurchaseHistoryLots([
      lot('older', { acquired_on: '2026-09-02', created_at: '2026-09-02T00:00:00.000Z' }),
      lot('newer', { acquired_on: '2026-09-19', created_at: '2026-09-19T00:00:00.000Z' }),
      lot('same-day-later', {
        acquired_on: '2026-09-19',
        created_at: '2026-09-19T12:00:00.000Z',
      }),
    ]);
    expect(result.map((entry) => entry.id)).toEqual(['same-day-later', 'newer', 'older']);
  });

  it('does not let depleted purchases contribute parent expiration evidence', () => {
    const lots = [
      lot('depleted-expired', {
        quantity_remaining: 0,
        expires_on: '2026-09-02',
      }),
      lot('active', { expires_on: '2026-09-10' }),
    ];
    expect(earliestActiveExpirationEvidence(lots)).toEqual({
      date: '2026-09-10',
      kind: 'exact',
    });
    expect(activeAcquisitionLots(lots).map((entry) => entry.id)).toEqual(['active']);
  });

  it('filters only on factual active expiration and exact aggregate inventory states', () => {
    const items: PantryOnHandItem[] = [
      { key: 'food-1::item', food_object_id: 'food-1', name: 'Spinach', quantity: 1, unit: 'item', updated_at: '2026-09-01' },
      { key: 'food-2::item', food_object_id: 'food-2', name: 'Rice', quantity: 0, unit: 'item', updated_at: '2026-09-01' },
      { key: 'food-3::item', food_object_id: 'food-3', name: 'Beans', quantity: 1, unit: 'item', updated_at: '2026-09-01' },
    ];
    const result = filterAndSortPantryItems({
      items,
      lotsByPantryKey: {
        'food-1::item': [lot('spinach', { pantry_item_key: 'food-1::item', expires_on: '2026-09-04' })],
        'food-3::item': [
          lot('depleted-only', {
            pantry_item_key: 'food-3::item',
            quantity_remaining: 0,
            expires_on: '2026-09-04',
          }),
        ],
      },
      query: '',
      perishability: 'evidence',
      inventory: 'positive',
    });
    expect(result.map((item) => item.name)).toEqual(['Spinach']);
  });

  it('keeps parent expired when an older active purchase is expired and a newer active purchase has no evidence', () => {
    const lots = [
      lot('newer', {
        acquired_on: '2026-09-19',
        created_at: '2026-09-19T00:00:00.000Z',
      }),
      lot('older-expired', {
        acquired_on: '2026-09-02',
        created_at: '2026-09-02T00:00:00.000Z',
        expires_on: '2026-09-15',
      }),
    ];
    const evidence = earliestActiveExpirationEvidence(lots);
    expect(evidence).toEqual({ date: '2026-09-15', kind: 'exact' });
    expect(parentExpirationShortState(evidence!, '2026-09-18')).toBe('Expired');
  });

  it('clears parent expiration evidence when the expired active purchase becomes depleted', () => {
    const lots = [
      lot('newer', {
        acquired_on: '2026-09-19',
        created_at: '2026-09-19T00:00:00.000Z',
      }),
      lot('older-expired', {
        acquired_on: '2026-09-02',
        created_at: '2026-09-02T00:00:00.000Z',
        expires_on: '2026-09-15',
        quantity_remaining: 0,
      }),
    ];
    expect(earliestActiveExpirationEvidence(lots)).toBeNull();
  });

  it('does not drive parent expiration sort from depleted purchases', () => {
    const items: PantryOnHandItem[] = [
      { key: 'food-1::item', food_object_id: 'food-1', name: 'Spinach', quantity: 1, unit: 'item', updated_at: '2026-09-01' },
      { key: 'food-2::item', food_object_id: 'food-2', name: 'Kale', quantity: 1, unit: 'item', updated_at: '2026-09-01' },
    ];
    const result = filterAndSortPantryItems({
      items,
      lotsByPantryKey: {
        'food-1::item': [
          lot('depleted-soon', {
            pantry_item_key: 'food-1::item',
            quantity_remaining: 0,
            expires_on: '2026-09-01',
          }),
        ],
        'food-2::item': [
          lot('active-later', {
            pantry_item_key: 'food-2::item',
            expires_on: '2026-09-20',
          }),
        ],
      },
      query: '',
      perishability: 'all',
      inventory: 'all',
    });
    expect(result.map((item) => item.name)).toEqual(['Kale', 'Spinach']);
  });

  it('formats exact expiration tense relative to today', () => {
    const past = { date: '2026-09-15', kind: 'exact' as const };
    const today = { date: '2026-09-18', kind: 'exact' as const };
    const future = { date: '2026-09-22', kind: 'exact' as const };
    const todayYmd = '2026-09-18';

    expect(expirationEvidenceTense(past, todayYmd)).toBe('expired');
    expect(expirationEvidenceTense(today, todayYmd)).toBe('today');
    expect(expirationEvidenceTense(future, todayYmd)).toBe('future');
    expect(formatExpirationEvidenceLabel(past, todayYmd)).toContain('Expired');
    expect(formatExpirationEvidenceLabel(today, todayYmd)).toBe('Expires today');
    expect(formatExpirationEvidenceLabel(future, todayYmd)).toContain('Expires');
    expect(formatExpirationEvidenceLabel(future, todayYmd)).not.toContain('Expired');
    expect(parentExpirationShortState(past, todayYmd)).toBe('Expired');
    expect(parentExpirationShortState(today, todayYmd)).toBe('Expires today');
    expect(parentExpirationShortState(future, todayYmd)).toBeNull();
  });

  it('keeps expected expiration evidence explicitly estimated', () => {
    const past = { date: '2026-09-15', kind: 'expected' as const };
    const today = { date: '2026-09-18', kind: 'expected' as const };
    const future = { date: '2026-09-22', kind: 'expected' as const };
    const todayYmd = '2026-09-18';

    expect(expirationEvidenceTense(past, todayYmd)).toBe('expected');
    expect(expirationEvidenceTense(today, todayYmd)).toBe('today');
    expect(expirationEvidenceTense(future, todayYmd)).toBe('expected');
    expect(formatExpirationEvidenceLabel(past, todayYmd)).toContain('Expected expiration');
    expect(formatExpirationEvidenceLabel(past, todayYmd)).not.toContain('Expired');
    expect(formatExpirationEvidenceLabel(today, todayYmd)).toBe('Expected expiration today');
    expect(formatExpirationEvidenceLabel(future, todayYmd)).toContain('Expected expiration');
    expect(parentExpirationShortState(past, todayYmd)).toBeNull();
  });

  it('formats individual purchase state with depletion priority', () => {
    const todayYmd = '2026-09-18';
    expect(formatPurchaseStateLabel(lot('used-up', { quantity_remaining: 0, expires_on: '2026-09-01' }), todayYmd))
      .toBe('Used up');
    expect(formatPurchaseStateLabel(lot('unset'), todayYmd)).toBe('Expiration not set');
    expect(formatPurchaseStateLabel(lot('expired', { expires_on: '2026-09-15' }), todayYmd))
      .toContain('Expired');
    expect(formatPurchaseStateLabel(lot('future', { expires_on: '2026-09-22' }), todayYmd))
      .toContain('Expires');
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
