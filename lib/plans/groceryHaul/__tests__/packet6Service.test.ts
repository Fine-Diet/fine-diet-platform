import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}
jest.mock('@/lib/plans/groceryListService', () => ({
  GroceryListNotFoundError,
  getPersistentGroceryListDetail: jest.fn(),
}));

import {
  GroceryHaulConflictError,
  GroceryHaulValidationError,
  addGroceryListsToDraftHaul,
  getGroceryHaulDetail,
  listGroceryHaulsForPerson,
  updateGroceryHaulItemPreparation,
  updateGroceryHaulMetadata,
} from '../service';
import { GROCERY_HAUL_ADD_LISTS_RPC_NAME } from '../schema';

const PERSON = 'person-1';

function installFake(status = 'planned') {
  const initial: Record<string, Row[]> = {
    grocery_hauls: [{
      id: 'haul-1',
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      shopping_date: '2026-09-08',
      status,
      creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title: 'Haul · Sep 8',
      budget_amount: null,
      currency: 'USD',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    }],
    grocery_haul_source_lists: [
      {
        haul_id: 'haul-1',
        grocery_list_id: 'list-1',
        person_id: PERSON,
        created_at: '2026-09-08T00:00:00.000Z',
      },
      {
        haul_id: 'haul-1',
        grocery_list_id: 'list-2',
        person_id: PERSON,
        created_at: '2026-09-08T00:00:01.000Z',
      },
    ],
    generated_grocery_lists: [
      { id: 'list-1', person_id: PERSON, title: 'Essentials' },
      { id: 'list-2', person_id: PERSON, title: 'Weekend' },
    ],
    grocery_haul_items: [{
      id: 'haul-item-1',
      haul_id: 'haul-1',
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      grocery_item_id: 'list-item-1',
      name_snapshot: 'Oats',
      quantity_snapshot: 4,
      unit_snapshot: 'cup',
      food_object_id_snapshot: 'food-oats',
      source_status_snapshot: 'pending',
      source_type_snapshot: 'manual',
      source_id_snapshot: null,
      final_quantity: 2,
      selected_food_object_id: 'product-oats',
      product_title: 'Rolled oats',
      retailer: 'Market',
      store_location: 'Downtown',
      postal_code: '60601',
      price_amount: 3,
      price_currency: 'USD',
      price_source: 'sourced',
      resolution_source: 'source_list',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    }],
    grocery_list_purchasing_choices: [
      { id: 'choice-1', grocery_item_id: 'list-item-1', preferred_product: 'List oats' },
    ],
    grocery_list_price_observations: [
      { id: 'price-1', grocery_item_id: 'list-item-1', line_total: 9 },
    ],
  };
  const fake = createFakeSupabase(initial);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Packet 6 Haul preparation service', () => {
  it('builds the Packet 8 Library model with complete memberships and persisted estimates in four batched reads', async () => {
    installFake();
    const rows = await listGroceryHaulsForPerson(PERSON);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Haul · Sep 8',
      source_list_names: ['Essentials', 'Weekend'],
      item_count: 1,
      execution_item_count: 1,
      unpriced_item_count: 0,
      estimated_total: 6,
      currency: 'USD',
      store_names: ['Downtown'],
    });
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  it('returns complete memberships, persisted resolutions, and one estimate in fixed queries', async () => {
    installFake();
    const detail = await getGroceryHaulDetail(PERSON, 'haul-1');
    expect(detail.source_lists.map((source) => source.title)).toEqual(['Essentials', 'Weekend']);
    expect(detail.items[0]).toMatchObject({
      quantity_snapshot: 4,
      final_quantity: 2,
      product_title: 'Rolled oats',
    });
    expect(detail.estimate).toMatchObject({
      estimated_total: 6,
      execution_item_count: 1,
      priced_item_count: 1,
    });
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  it('changes final quantity independently and never mutates List truth', async () => {
    const fake = installFake();
    const choicesBefore = structuredClone(fake.getTable('grocery_list_purchasing_choices'));
    const pricesBefore = structuredClone(fake.getTable('grocery_list_price_observations'));

    const updated = await updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: { finalQuantity: 0 },
    });

    expect(updated.final_quantity).toBe(0);
    expect(updated.quantity_snapshot).toBe(4);
    expect(fake.getTable('grocery_list_purchasing_choices')).toEqual(choicesBefore);
    expect(fake.getTable('grocery_list_price_observations')).toEqual(pricesBefore);
  });

  it('uses frozen source quantity as the mixed-version fallback for legacy rows', async () => {
    const fake = installFake();
    delete fake.getTable('grocery_haul_items')[0].final_quantity;
    const detail = await getGroceryHaulDetail(PERSON, 'haul-1');
    expect(detail.items[0].final_quantity).toBe(4);
    expect(detail.estimate.execution_item_count).toBe(1);
  });

  it('makes an explicit Haul price manual and leaves List product/price rows unchanged', async () => {
    const fake = installFake();
    const choicesBefore = structuredClone(fake.getTable('grocery_list_purchasing_choices'));
    const pricesBefore = structuredClone(fake.getTable('grocery_list_price_observations'));

    const updated = await updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: {
        productTitle: 'Haul-only substitute',
        retailer: 'Other Market',
        priceAmount: 2.5,
      },
    });

    expect(updated).toMatchObject({
      product_title: 'Haul-only substitute',
      retailer: 'Other Market',
      price_amount: 2.5,
      price_currency: 'USD',
      price_source: 'manual',
      resolution_source: 'haul_edit',
      quantity_snapshot: 4,
    });
    expect(fake.getTable('grocery_list_purchasing_choices')).toEqual(choicesBefore);
    expect(fake.getTable('grocery_list_price_observations')).toEqual(pricesBefore);
  });

  it('copies a validated List quote into independent Haul price state', async () => {
    const fake = installFake();
    Object.assign(fake.getTable('grocery_list_price_observations')[0], {
      person_id: PERSON,
      grocery_list_id: 'list-1',
      source: 'serpapi',
      product_title: 'Selected source product',
      brand_name: 'Source Brand',
      package_size: 12,
      package_unit: 'oz',
      package_count: 1,
      retailer: 'Source Market',
      postal_code: '60601',
      unit_price: 4.5,
      currency: 'USD',
      retrieved_at: '2026-09-08T01:00:00.000Z',
    });

    const updated = await updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: { sourcePriceObservationId: 'price-1' },
    });

    expect(updated).toMatchObject({
      product_title: 'Selected source product',
      retailer: 'Source Market',
      price_amount: 4.5,
      price_currency: 'USD',
      price_source: 'sourced',
      source_price_observation_id: 'price-1',
      resolution_source: 'haul_edit',
    });
  });

  it('clears stale sourced price authority after a Haul-only context edit', async () => {
    installFake();
    const updated = await updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: { retailer: 'Different Market' },
    });
    expect(updated).toMatchObject({
      retailer: 'Different Market',
      price_amount: null,
      price_currency: null,
      price_source: null,
      source_price_observation_id: null,
      resolution_source: 'haul_edit',
    });
  });

  it('autosaves Draft metadata and rejects invalid quantities and historical edits', async () => {
    installFake();
    await expect(updateGroceryHaulMetadata({
      personId: PERSON,
      haulId: 'haul-1',
      title: 'Saturday haul',
      budgetAmount: 50,
    })).resolves.toMatchObject({ title: 'Saturday haul', budget_amount: 50 });

    await expect(updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: { finalQuantity: -1 },
    })).rejects.toBeInstanceOf(GroceryHaulValidationError);

    for (const status of ['active', 'closed', 'cancelled']) {
      installFake(status);
      await expect(updateGroceryHaulItemPreparation({
        personId: PERSON,
        haulId: 'haul-1',
        itemId: 'haul-item-1',
        patch: { finalQuantity: 1 },
      })).rejects.toBeInstanceOf(GroceryHaulConflictError);
      await expect(updateGroceryHaulMetadata({
        personId: PERSON,
        haulId: 'haul-1',
        title: 'Changed history',
      })).rejects.toBeInstanceOf(GroceryHaulConflictError);
    }
  });

  it('normalizes source IDs and delegates atomic/idempotent addition to the RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        haul_id: 'haul-1',
        source_grocery_list_ids: ['list-2'],
        added_source_count: 1,
        item_count: 2,
        outcome: 'updated',
      },
      error: null,
    });
    await expect(addGroceryListsToDraftHaul({
      personId: PERSON,
      haulId: 'haul-1',
      listIds: [' list-2 ', 'list-2'],
    })).resolves.toMatchObject({ added_source_count: 1, item_count: 2 });
    expect(mockRpc).toHaveBeenCalledWith(GROCERY_HAUL_ADD_LISTS_RPC_NAME, {
      p_person_id: PERSON,
      p_haul_id: 'haul-1',
      p_source_grocery_list_ids: ['list-2'],
    });

    mockRpc.mockResolvedValueOnce({
      data: {
        haul_id: 'haul-1',
        source_grocery_list_ids: ['list-2'],
        added_source_count: 0,
        item_count: 0,
        outcome: 'noop',
      },
      error: null,
    });
    await expect(addGroceryListsToDraftHaul({
      personId: PERSON,
      haulId: 'haul-1',
      listIds: ['list-2'],
    })).resolves.toMatchObject({ outcome: 'noop', item_count: 0 });
  });

  it('maps cross-owner source and non-Draft rejection without local writes', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'HAUL_ADD_LISTS_LIST_NOT_FOUND' },
    });
    await expect(addGroceryListsToDraftHaul({
      personId: PERSON,
      haulId: 'haul-1',
      listIds: ['other-owner-list'],
    })).rejects.toBeInstanceOf(GroceryListNotFoundError);

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'HAUL_ADD_LISTS_NOT_DRAFT' },
    });
    await expect(addGroceryListsToDraftHaul({
      personId: PERSON,
      haulId: 'haul-1',
      listIds: ['list-2'],
    })).rejects.toBeInstanceOf(GroceryHaulConflictError);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
