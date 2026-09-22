import type { PantryAcquisitionLot } from '@/lib/plans/types';

import { validatePantryLotSave } from '../pantryLotSave';

function mockLot(
  overrides: Partial<PantryAcquisitionLot> & Pick<PantryAcquisitionLot, 'quantity_acquired' | 'quantity_remaining'>,
): PantryAcquisitionLot {
  return {
    id: 'lot-1',
    pantry_item_id: 'pid',
    pantry_item_key: 'key',
    person_id: 'person',
    acquired_on: '2026-01-01',
    expires_on: null,
    expected_shelf_life_days: null,
    unit: 'lb',
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
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('validatePantryLotSave', () => {
  const baseDraft = {
    acquiredOn: '2026-01-01',
    expiresOn: '',
    expectedShelfLifeDays: '',
    quantityAcquired: '4',
    quantityRemaining: '1',
    unit: 'lb',
    productTitle: '',
    brandName: '',
    packageSize: '',
    packageUnit: '',
    packageCount: '',
    retailer: '',
    priceAmount: '',
    currency: 'USD',
  };

  it('initializes remaining to acquired for new lots', () => {
    const result = validatePantryLotSave(baseDraft, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.quantity_acquired).toBe(4);
      expect(result.input.quantity_remaining).toBe(4);
    }
  });

  it('preserves remaining on edit and ignores draft remaining', () => {
    const result = validatePantryLotSave(
      { ...baseDraft, quantityAcquired: '6', quantityRemaining: '99' },
      mockLot({ quantity_acquired: 4, quantity_remaining: 2 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.quantity_acquired).toBe(6);
      expect(result.input.quantity_remaining).toBe(2);
    }
  });

  it('blocks acquired below preserved remaining', () => {
    const result = validatePantryLotSave(
      { ...baseDraft, quantityAcquired: '1' },
      mockLot({ quantity_acquired: 4, quantity_remaining: 2 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('cannot be less');
      expect(result.error).toContain('2');
    }
  });

  it('keeps draft currency when price is present on edit', () => {
    const result = validatePantryLotSave(
      {
        ...baseDraft,
        priceAmount: '5.99',
        currency: 'CAD',
        quantityRemaining: '0',
      },
      mockLot({
        quantity_acquired: 4,
        quantity_remaining: 4,
        price_amount: 3,
        currency: 'EUR',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.currency).toBe('CAD');
    }
  });
});
