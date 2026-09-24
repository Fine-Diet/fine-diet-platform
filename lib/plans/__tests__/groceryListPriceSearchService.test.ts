import { setSerpApiFetchOverride, setSerpApiProviderTimeoutMsOverride } from '../groceryPriceSerpApiProvider';
import {
  setPantryRetailLocationsFetchOverride,
} from '../pantryRetailSearchLocation';
import {
  searchListGroceryItemPrices,
  setListPriceSearchTimeoutMsOverride,
} from '../groceryListPriceSearchService';

const mockSupabaseFrom = jest.fn();
const mockGetPurchasingChoiceForItem = jest.fn();
const mockGetGroceryPriceCache = jest.fn();
const mockInsertGroceryPriceSearchEvent = jest.fn();
const mockReserveGroceryPriceSearchQuota = jest.fn();
const mockFinalizeQuotaClaim = jest.fn();
const mockBuildGroceryPriceSearchQuota = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockSupabaseFrom(...args) },
}));

jest.mock('../groceryListPurchasingChoiceStore', () => ({
  getPurchasingChoiceForItem: (...args: unknown[]) => mockGetPurchasingChoiceForItem(...args),
}));

jest.mock('../groceryPriceStore', () => ({
  getGroceryPriceCache: (...args: unknown[]) => mockGetGroceryPriceCache(...args),
  insertGroceryPriceSearchEvent: (...args: unknown[]) => mockInsertGroceryPriceSearchEvent(...args),
  upsertGroceryPriceCache: jest.fn(),
  getGroceryPriceSearchEvent: jest.fn(),
  buildCandidateSnapshot: jest.fn(() => ({})),
}));

jest.mock('../groceryPriceQuotaReservation', () => ({
  reserveGroceryPriceSearchQuota: (...args: unknown[]) => mockReserveGroceryPriceSearchQuota(...args),
  finalizeQuotaClaim: (...args: unknown[]) => mockFinalizeQuotaClaim(...args),
}));

jest.mock('../groceryPriceQuota', () => ({
  buildGroceryPriceSearchQuota: (...args: unknown[]) => mockBuildGroceryPriceSearchQuota(...args),
}));

const PERSON_ID = 'person-1';
const LIST_ID = 'list-1';
const ITEM_ID = 'item-1';

function mockListAndItem() {
  mockSupabaseFrom.mockImplementation((table: string) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };
    if (table === 'generated_grocery_lists') {
      chain.maybeSingle.mockResolvedValue({
        data: { id: LIST_ID, person_id: PERSON_ID, plan_id: null },
        error: null,
      });
    }
    if (table === 'grocery_items') {
      chain.maybeSingle.mockResolvedValue({
        data: {
          id: ITEM_ID,
          grocery_list_id: LIST_ID,
          person_id: PERSON_ID,
          name: 'Blueberries',
          quantity: 1,
          unit: 'cup',
          food_object_id: null,
        },
        error: null,
      });
    }
    if (table === 'food_objects') {
      chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    }
    return chain;
  });
}

function mockPostal74105() {
  setPantryRetailLocationsFetchOverride(async () => ([
    {
      name: '74105, Oklahoma, United States',
      canonical_name: '74105, Oklahoma, United States',
      country_code: 'US',
      target_type: 'Postal Code',
    },
  ]));
}

describe('searchListGroceryItemPrices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSerpApiFetchOverride(null);
    setSerpApiProviderTimeoutMsOverride(null);
    setPantryRetailLocationsFetchOverride(null);
    setListPriceSearchTimeoutMsOverride(null);
    mockGetPurchasingChoiceForItem.mockResolvedValue(null);
    mockGetGroceryPriceCache.mockResolvedValue(null);
    mockReserveGroceryPriceSearchQuota.mockResolvedValue({
      claimId: 'claim-1',
      tier: 'demo',
      windowKey: 'lifetime',
    });
    mockFinalizeQuotaClaim.mockResolvedValue(undefined);
    mockInsertGroceryPriceSearchEvent.mockResolvedValue({ id: 'event-1' });
    mockBuildGroceryPriceSearchQuota.mockResolvedValue({
      tier: 'demo',
      access_mode: 'demo',
      limit: 3,
      used: 0,
      remaining: 3,
      reset_at: null,
      consumed_this_request: false,
      upgrade_required: false,
    });
    mockListAndItem();
    mockPostal74105();
  });

  afterEach(() => {
    setSerpApiFetchOverride(null);
    setSerpApiProviderTimeoutMsOverride(null);
    setPantryRetailLocationsFetchOverride(null);
    setListPriceSearchTimeoutMsOverride(null);
    jest.useRealTimers();
  });

  it('resolves 74105 through Supported Locations before provider search', async () => {
    let observedContext: { provider_location?: string | null; postal_code: string } | null = null;
    setSerpApiFetchOverride(async () => ({ shopping_results: [] }));
    const { serpApiGroceryPriceProvider } = await import('../groceryPriceSerpApiProvider');
    const originalSearch = serpApiGroceryPriceProvider.search.bind(serpApiGroceryPriceProvider);
    serpApiGroceryPriceProvider.search = async (context, query, options) => {
      observedContext = {
        provider_location: context.provider_location,
        postal_code: context.postal_code,
      };
      return originalSearch(context, query, options);
    };

    await searchListGroceryItemPrices({
      personId: PERSON_ID,
      listId: LIST_ID,
      itemId: ITEM_ID,
      retailer: 'Walmart',
      postalCode: '74105',
    });

    expect(observedContext).toMatchObject({
      postal_code: '74105',
      provider_location: '74105, Oklahoma, United States',
    });
    serpApiGroceryPriceProvider.search = originalSearch;
  });

  it('rejects unresolved location before quota reservation', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([]));
    await expect(searchListGroceryItemPrices({
      personId: PERSON_ID,
      listId: LIST_ID,
      itemId: ITEM_ID,
      retailer: 'Walmart',
      postalCode: '99999',
    })).rejects.toThrow('Unable to resolve a market location');
    expect(mockReserveGroceryPriceSearchQuota).not.toHaveBeenCalled();
  });

  it('returns provider_error timeout, releases quota, and does not bill', async () => {
    jest.useFakeTimers();
    setSerpApiProviderTimeoutMsOverride(5_000);
    setListPriceSearchTimeoutMsOverride(50);
    setSerpApiFetchOverride((_url, init) => new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('expected abort signal'));
        return;
      }
      signal.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const promise = searchListGroceryItemPrices({
      personId: PERSON_ID,
      listId: LIST_ID,
      itemId: ITEM_ID,
      retailer: 'Walmart',
      postalCode: '74105',
    });
    await jest.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result.outcome).toBe('provider_error');
    expect(result.provider_error?.code).toBe('timeout');
    expect(mockFinalizeQuotaClaim).toHaveBeenCalledWith({
      claimId: 'claim-1',
      status: 'released',
    });
    expect(mockFinalizeQuotaClaim).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'billed' }),
    );
  }, 15_000);
});
