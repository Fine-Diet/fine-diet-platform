import { createFakeSupabase, type Row } from './testSupabaseFake';

const PERSON = 'person-1';
const PANTRY_KEY = 'food-chicken::lb';
const mockFrom = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  createPantryAcquisitionLot,
  listPantryAcquisitionLots,
  updatePantryAcquisitionLot,
} from '../pantryAcquisitionLotService';

function installFake(initial: Record<string, Row[]>) {
  const fake = createFakeSupabase(initial);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Pantry acquisition lots', () => {
  it('stores distinct acquisition histories under one unchanged aggregate item', async () => {
    const fake = installFake({
      pantry_on_hand_items: [{
        id: 'pantry-1',
        person_id: PERSON,
        key: PANTRY_KEY,
        food_object_id: 'food-chicken',
        name: 'Chicken Breast',
        quantity: 3,
        unit: 'lb',
      }],
      pantry_acquisition_lots: [],
    });

    const first = await createPantryAcquisitionLot({
      personId: PERSON,
      pantryItemKey: PANTRY_KEY,
      lot: {
        acquiredOn: '2026-09-01',
        expiresOn: '2026-09-08',
        expectedShelfLifeDays: 7,
        quantityAcquired: 2,
        quantityRemaining: 1,
        unit: 'lb',
        productTitle: 'Boneless Chicken Breast',
        brandName: 'Brand A',
        packageSize: 2,
        packageUnit: 'lb',
        packageCount: 1,
        retailer: 'Store A',
        priceAmount: 6.98,
        currency: 'USD',
        sourceHaulId: 'haul-1',
        sourceHaulItemId: 'haul-item-1',
      },
    });
    const second = await createPantryAcquisitionLot({
      personId: PERSON,
      pantryItemKey: PANTRY_KEY,
      lot: {
        acquiredOn: '2026-09-06',
        expiresOn: '2026-09-13',
        quantityAcquired: 1,
        quantityRemaining: 1,
        unit: 'lb',
        productTitle: 'Organic Chicken Breast',
        retailer: 'Store B',
        priceAmount: 8.25,
        currency: 'USD',
        sourceHaulId: 'haul-2',
        sourceHaulItemId: 'haul-item-2',
      },
    });

    const lots = await listPantryAcquisitionLots(PERSON, PANTRY_KEY);
    expect(lots).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    expect(lots.map((lot) => lot.retailer).sort()).toEqual(['Store A', 'Store B']);
    expect(lots.map((lot) => lot.source_haul_id).sort()).toEqual(['haul-1', 'haul-2']);
    expect(fake.getTable('pantry_on_hand_items')).toEqual([
      expect.objectContaining({ id: 'pantry-1', quantity: 3, unit: 'lb' }),
    ]);
  });

  it('updates one lot remaining quantity without rewriting the Pantry aggregate', async () => {
    const fake = installFake({
      pantry_on_hand_items: [{
        id: 'pantry-1',
        person_id: PERSON,
        key: PANTRY_KEY,
        quantity: 2,
        unit: 'lb',
      }],
      pantry_acquisition_lots: [{
        id: 'lot-1',
        pantry_item_id: 'pantry-1',
        person_id: PERSON,
        acquired_on: '2026-09-01',
        expires_on: null,
        expected_shelf_life_days: null,
        quantity_acquired: 2,
        quantity_remaining: 2,
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
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      }],
    });

    const updated = await updatePantryAcquisitionLot({
      personId: PERSON,
      lotId: 'lot-1',
      patch: { quantityRemaining: 0.5 },
    });
    expect(updated.quantity_remaining).toBe(0.5);
    expect(fake.getTable('pantry_on_hand_items')[0].quantity).toBe(2);
  });

  it('cannot attach a lot through another person’s Pantry item key', async () => {
    installFake({
      pantry_on_hand_items: [{
        id: 'pantry-other',
        person_id: 'person-other',
        key: PANTRY_KEY,
      }],
      pantry_acquisition_lots: [],
    });

    await expect(
      createPantryAcquisitionLot({
        personId: PERSON,
        pantryItemKey: PANTRY_KEY,
        lot: {
          acquiredOn: '2026-09-08',
          quantityAcquired: 1,
          quantityRemaining: 1,
        },
      }),
    ).rejects.toThrow('Pantry item not found.');
  });
});
