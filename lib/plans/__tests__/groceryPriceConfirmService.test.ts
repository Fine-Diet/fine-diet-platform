import { confirmSourcedGroceryPrice } from '../groceryPriceServerService';
import { GroceryPriceManualReplaceRequiredError } from '../groceryPriceManualReplace';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('../groceryPriceStore', () => ({
  getGroceryPriceSearchEvent: jest.fn(),
  appendSourcedGroceryPriceObservation: jest.fn(),
  searchEventMatchesItemScope: jest.fn().mockReturnValue(true),
}));

jest.mock('../groceryPriceConfirmShoppingMerge', () => ({
  applyOfferPackageToShoppingDetails: jest.fn().mockResolvedValue(null),
}));

import { applyOfferPackageToShoppingDetails } from '../groceryPriceConfirmShoppingMerge';

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  appendSourcedGroceryPriceObservation,
  getGroceryPriceSearchEvent,
} from '../groceryPriceStore';

const mockFrom = supabaseAdmin.from as jest.Mock;
const mockGetEvent = getGroceryPriceSearchEvent as jest.MockedFunction<typeof getGroceryPriceSearchEvent>;
const mockAppendSourced = appendSourcedGroceryPriceObservation as jest.MockedFunction<
  typeof appendSourcedGroceryPriceObservation
>;
const mockApplyPackageMerge = applyOfferPackageToShoppingDetails as jest.MockedFunction<
  typeof applyOfferPackageToShoppingDetails
>;

const ITEM = {
  id: 'item-1',
  grocery_list_id: 'list-1',
  person_id: 'person-1',
  name: 'spinach',
  quantity: 2,
  unit: 'cup',
  aisle_category: null,
  food_object_id: 'food-1',
  source_planned_meal_ids: [],
  status: 'pending',
  notes: null,
};

function mockItemScope() {
  const groceryItemsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: ITEM, error: null }),
  };
  const groceryListsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        plan_id: 'plan-1',
        date_range_start: '2026-07-15',
        date_range_end: '2026-07-15',
      },
      error: null,
    }),
  };
  const foodObjectsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        canonical_name: 'Baby Spinach',
        brand_name: 'Organic Girl',
        upc: null,
        image_url: null,
        serving_description: null,
      },
      error: null,
    }),
  };
  mockFrom.mockImplementation((table: string) => {
    if (table === 'grocery_items') return groceryItemsChain;
    if (table === 'generated_grocery_lists') return groceryListsChain;
    if (table === 'food_objects') return foodObjectsChain;
    throw new Error(`Unexpected table ${table}`);
  });
}

describe('confirmSourcedGroceryPrice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockItemScope();
    mockGetEvent.mockResolvedValue({
      id: 'event-1',
      retailer: 'Target',
      postal_code: '94110',
      created_at: new Date().toISOString(),
      candidate_snapshot: {
        offers: [
          {
            provider_result_id: 'result-1',
            title: 'Organic Spinach',
            price: 3.99,
            currency: 'USD',
            package_size: 5,
            package_unit: 'oz',
            product_url: null,
            image_url: null,
            match_confidence: 0.9,
          },
        ],
      },
    } as never);
  });

  it('rejects provider_result_id missing from the persisted snapshot', async () => {
    await expect(
      confirmSourcedGroceryPrice({
        personId: 'person-1',
        input: {
          grocery_item_id: 'item-1',
          search_event_id: 'event-1',
          provider_result_id: 'not-in-snapshot',
        },
      }),
    ).rejects.toThrow('provider_result_id was not found in the search event');
  });

  it('passes replaceManual intent to append-only store path', async () => {
    mockAppendSourced.mockResolvedValue({
      id: 'obs-sourced',
      source: 'serpapi',
      supersedes_observation_id: 'obs-manual',
    } as never);

    await confirmSourcedGroceryPrice({
      personId: 'person-1',
      input: {
        grocery_item_id: 'item-1',
        search_event_id: 'event-1',
        provider_result_id: 'result-1',
        replace_manual: true,
      },
    });

    expect(mockAppendSourced).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_result_id: 'result-1',
        search_event_id: 'event-1',
        package_size: 5,
        package_unit: 'oz',
      }),
      { replaceManual: true },
    );
    expect(mockApplyPackageMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'person-1',
        offer: { package_size: 5, package_unit: 'oz' },
      }),
    );
  });

  it('does not pass package_count into shopping purchase_quantity merge', async () => {
    mockAppendSourced.mockResolvedValue({
      id: 'obs-sourced',
      source: 'serpapi',
    } as never);

    await confirmSourcedGroceryPrice({
      personId: 'person-1',
      input: {
        grocery_item_id: 'item-1',
        search_event_id: 'event-1',
        provider_result_id: 'result-1',
        package_count: 3,
      },
    });

    expect(mockApplyPackageMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        offer: { package_size: 5, package_unit: 'oz' },
      }),
    );
    expect(mockApplyPackageMerge).not.toHaveBeenCalledWith(
      expect.objectContaining({
        offer: expect.objectContaining({ package_size: 3 }),
      }),
    );
  });

  it('surfaces manual replace required errors from the store', async () => {
    mockAppendSourced.mockRejectedValue(
      new GroceryPriceManualReplaceRequiredError({
        id: 'obs-manual',
        source: 'manual',
      } as never),
    );

    await expect(
      confirmSourcedGroceryPrice({
        personId: 'person-1',
        input: {
          grocery_item_id: 'item-1',
          search_event_id: 'event-1',
          provider_result_id: 'result-1',
        },
      }),
    ).rejects.toMatchObject({ name: 'GroceryPriceManualReplaceRequiredError' });
  });
});
