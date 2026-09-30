import { createFakeSupabase } from '@/lib/plans/__tests__/testSupabaseFake';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('@/lib/plans/groceryPricingConfig', () => ({
  ...jest.requireActual('@/lib/plans/groceryPricingConfig'),
  isGroceryPriceProviderEnabled: () => true,
  resolveGroceryPriceSerpApiApiKey: () => 'test-key',
  warnIfGroceryPriceSerpApiKeyMissingInDev: () => {},
}));

import {
  GroceryHaulConflictError,
  GroceryHaulValidationError,
} from '../service';
import {
  addGroceryHaulStore,
  removeGroceryHaulStore,
  searchGroceryHaulStores,
} from '../haulStoreRoster';
import { GROCERY_HAUL_REMOVE_STORE_RPC_NAME } from '../schema';
import {
  searchHaulStorePlaces,
  setHaulStoreSerpApiFetchOverride,
} from '../haulStoreSerpApiProvider';
import { buildManualHaulStoreIdentityKey } from '../haulStoreIdentity';

const PERSON = 'person-1';
const HAUL = 'haul-1';

function installDraftHaul() {
  const fake = createFakeSupabase({
    grocery_hauls: [{
      id: HAUL,
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      shopping_date: '2026-09-08',
      status: 'planned',
      creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      currency: 'USD',
    }],
    grocery_haul_stores: [],
    grocery_haul_items: [],
  });
  mockFrom.mockImplementation((table: string) => fake.from(table));
  mockRpc.mockReset();
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
  setHaulStoreSerpApiFetchOverride(null);
});

describe('Haul store roster service', () => {
  it('adds a manual roster store and reuses duplicates by normalized identity', async () => {
    installDraftHaul();
    const first = await addGroceryHaulStore({
      personId: PERSON,
      haulId: HAUL,
      input: { source: 'manual', retailer: 'Whole Foods', store_location: 'Downtown', postal_code: '60601' },
    });
    expect(first.outcome).toBe('created');
    const second = await addGroceryHaulStore({
      personId: PERSON,
      haulId: HAUL,
      input: { source: 'manual', retailer: 'whole foods', store_location: 'downtown', postal_code: '60601' },
    });
    expect(second.outcome).toBe('reused');
    expect(second.store.id).toBe(first.store.id);
  });

  it('keeps same-retailer same-ZIP branches distinct when address_line1 differs', async () => {
    installDraftHaul();
    const first = await addGroceryHaulStore({
      personId: PERSON,
      haulId: HAUL,
      input: {
        source: 'manual',
        retailer: 'Target',
        address_line1: '100 Main St',
        postal_code: '78701',
      },
    });
    const second = await addGroceryHaulStore({
      personId: PERSON,
      haulId: HAUL,
      input: {
        source: 'manual',
        retailer: 'Target',
        address_line1: '200 Oak Ave',
        postal_code: '78701',
      },
    });
    expect(second.outcome).toBe('created');
    expect(second.store.id).not.toBe(first.store.id);
  });

  it('rejects roster mutation on non-draft hauls', async () => {
    const fake = installDraftHaul();
    fake.getTable('grocery_hauls')[0].status = 'active';
    await expect(addGroceryHaulStore({
      personId: PERSON,
      haulId: HAUL,
      input: { source: 'manual', retailer: 'Target' },
    })).rejects.toBeInstanceOf(GroceryHaulConflictError);
  });

  it('requires retailer on manual add', async () => {
    installDraftHaul();
    await expect(addGroceryHaulStore({
      personId: PERSON,
      haulId: HAUL,
      input: { source: 'manual', retailer: '   ' },
    })).rejects.toBeInstanceOf(GroceryHaulValidationError);
  });

  it('removes a store through the RPC cleanup path', async () => {
    installDraftHaul();
    mockRpc.mockResolvedValueOnce({
      data: { store_id: 'store-1', outcome: 'removed', affected_item_count: 2 },
      error: null,
    });
    const result = await removeGroceryHaulStore({
      personId: PERSON,
      haulId: HAUL,
      storeId: 'store-1',
    });
    expect(result.affected_item_count).toBe(2);
    expect(mockRpc).toHaveBeenCalledWith(GROCERY_HAUL_REMOVE_STORE_RPC_NAME, {
      p_person_id: PERSON,
      p_haul_id: HAUL,
      p_store_id: 'store-1',
    });
  });

  it('does not invoke provider search for non-draft hauls', async () => {
    const fake = installDraftHaul();
    fake.getTable('grocery_hauls')[0].status = 'active';
    const fetch = jest.fn();
    setHaulStoreSerpApiFetchOverride(fetch);
    await expect(searchGroceryHaulStores({
      personId: PERSON,
      haulId: HAUL,
      query: 'Target',
    })).rejects.toBeInstanceOf(GroceryHaulConflictError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Haul store search provider', () => {
  it('normalizes an exact-location place result using the same searched-store identity', async () => {
    setHaulStoreSerpApiFetchOverride(async () => ({
      place_results: {
        title: 'Walmart Neighborhood Market',
        place_id: 'walmart-peoria',
        data_id: 'maps-peoria',
        address: '4404 S Peoria Ave, Tulsa, OK 74105',
      },
    }));
    const result = await searchHaulStorePlaces({ query: 'Walmart', locationContext: '74105' });
    expect(result.results).toEqual([expect.objectContaining({
      provider_place_id: 'walmart-peoria', provider_data_id: 'maps-peoria',
      retailer: 'Walmart Neighborhood Market', postal_code: '74105',
    })]);
  });

  it.each(['Tulsa, OK', '74105', '4407 S Peoria Ave, Tulsa'])(
    'refines the Maps query with free-form context %s without inventing a radius',
    async (locationContext) => {
      const fetch = jest.fn(async () => ({ local_results: [] }));
      setHaulStoreSerpApiFetchOverride(fetch);
      await searchHaulStorePlaces({ query: ' Walmart ', locationContext: ` ${locationContext} ` });
      const url = new URL((fetch.mock.calls[0] as unknown as [string])[0]);
      expect(url.searchParams.get('q')).toBe(`Walmart ${locationContext}`);
      for (const parameter of ['location', 'z', 'm']) {
        expect(url.searchParams.has(parameter)).toBe(false);
      }
    },
  );

  it.each([undefined, '', '   '])('preserves an address embedded in the query with optional context %s', async (locationContext) => {
    const fetch = jest.fn(async () => ({ local_results: [] }));
    setHaulStoreSerpApiFetchOverride(fetch);
    const query = 'Walmart store at 4407 S Peoria Ave, Tulsa';
    await searchHaulStorePlaces({ query, locationContext });
    expect(new URL((fetch.mock.calls[0] as unknown as [string])[0]).searchParams.get('q')).toBe(query);
  });

  it('returns provider failures for the manual fallback', async () => {
    setHaulStoreSerpApiFetchOverride(async () => { throw new Error('Store search unavailable'); });
    await expect(searchHaulStorePlaces({ query: 'Walmart', locationContext: '74105' })).resolves.toEqual({
      results: [], provider_disabled: false, provider_error: 'Store search unavailable',
    });
  });

  it('normalizes local results without leaking api key material', async () => {
    setHaulStoreSerpApiFetchOverride(async () => ({
      local_results: [{
        place_id: 'place-1',
        title: 'Sprouts Farmers Market',
        address: '123 Main St, Austin, TX 78701',
        gps_coordinates: { latitude: 30.1, longitude: -97.7 },
      }],
    }));
    const result = await searchHaulStorePlaces({ query: 'Sprouts', locationContext: 'Austin, TX' });
    expect(result.results[0]?.provider_place_id).toBe('place-1');
    expect(result.results[0]?.retailer).toBe('Sprouts Farmers Market');
    expect(result.results[0]?.country_code).toBeNull();
    expect(JSON.stringify(result)).not.toContain('api_key');
  });

  it('returns empty results for short queries without calling provider', async () => {
    const fetch = jest.fn();
    setHaulStoreSerpApiFetchOverride(fetch);
    const result = await searchHaulStorePlaces({ query: 'a' });
    expect(result.results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('manual identity helper', () => {
  it('normalizes case and spacing', () => {
    expect(buildManualHaulStoreIdentityKey({
      retailer: ' Target ',
      storeLocation: 'North   Side',
      postalCode: '78701',
    })).toBe('target|north side|78701');
  });

  it('uses address_line1 when branch label is blank', () => {
    expect(buildManualHaulStoreIdentityKey({
      retailer: 'Target',
      addressLine1: '100 Main St',
      postalCode: '78701',
    })).toBe('target|100 main st|78701');
  });
});
