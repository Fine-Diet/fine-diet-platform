import { setSerpApiFetchOverride } from '../groceryPriceSerpApiProvider';
import {
  setPantryRetailLocationsFetchOverride,
} from '../pantryRetailSearchLocation';
import {
  PantryProductSearchLocationError,
  PantryProductSearchValidationError,
  searchPantryProductDetails,
  setPantryProductSearchTimeoutMsOverride,
} from '../pantryProductSearchService';

const mockBuildGroceryPriceSearchQuota = jest.fn();
const mockFinalizeQuotaClaim = jest.fn();
const mockReserveGroceryPriceSearchQuota = jest.fn();

jest.mock('../groceryPriceQuota', () => ({
  buildGroceryPriceSearchQuota: (...args: unknown[]) => mockBuildGroceryPriceSearchQuota(...args),
  GroceryPriceQuotaExceededError: class GroceryPriceQuotaExceededError extends Error {
    quota = { remaining: 0 };
  },
}));

jest.mock('../groceryPriceQuotaReservation', () => ({
  reserveGroceryPriceSearchQuota: (...args: unknown[]) => mockReserveGroceryPriceSearchQuota(...args),
  finalizeQuotaClaim: (...args: unknown[]) => mockFinalizeQuotaClaim(...args),
}));

const PERSON_ID = 'person-1';
const POSTAL_CODE = '94110';

function mockResolvablePostal() {
  setPantryRetailLocationsFetchOverride(async () => ([
    {
      name: '94110, California, United States',
      canonical_name: '94110, California, United States',
      country_code: 'US',
      target_type: 'Postal Code',
    },
  ]));
}

describe('searchPantryProductDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSerpApiFetchOverride(null);
    setPantryRetailLocationsFetchOverride(null);
    setPantryProductSearchTimeoutMsOverride(null);
    mockResolvablePostal();
    mockReserveGroceryPriceSearchQuota.mockResolvedValue({
      claimId: 'claim-1',
      tier: 'demo',
      windowKey: 'lifetime',
    });
    mockFinalizeQuotaClaim.mockResolvedValue(undefined);
    mockBuildGroceryPriceSearchQuota.mockResolvedValue({
      tier: 'demo',
      access_mode: 'demo',
      limit: 3,
      used: 1,
      remaining: 2,
      reset_at: null,
      consumed_this_request: false,
      upgrade_required: false,
    });
  });

  afterEach(() => {
    setSerpApiFetchOverride(null);
    setPantryRetailLocationsFetchOverride(null);
    setPantryProductSearchTimeoutMsOverride(null);
    jest.useRealTimers();
  });

  it('rejects blank or too-short queries', async () => {
    await expect(searchPantryProductDetails({
      personId: PERSON_ID,
      query: ' ',
      postal_code: POSTAL_CODE,
    })).rejects.toThrow('Search query must be at least 2 characters.');
  });

  it('rejects missing postal before quota reservation', async () => {
    await expect(searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'spinach',
      postal_code: ' ',
    })).rejects.toThrow('postal_code is required');
    expect(mockReserveGroceryPriceSearchQuota).not.toHaveBeenCalled();
  });

  it('rejects invalid postal before quota reservation', async () => {
    await expect(searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'spinach',
      postal_code: '12',
    })).rejects.toThrow('postal_code must be a valid US ZIP or Canadian postal code');
    expect(mockReserveGroceryPriceSearchQuota).not.toHaveBeenCalled();
  });

  it('rejects unresolved location before quota reservation', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([]));

    try {
      await searchPantryProductDetails({
        personId: PERSON_ID,
        query: 'spinach',
        postal_code: '99999',
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'PantryProductSearchLocationError',
        message: expect.stringContaining('Unable to resolve'),
      });
    }
    expect(mockReserveGroceryPriceSearchQuota).not.toHaveBeenCalled();
  });

  it('orders pantry offers with rankGroceryPriceCandidates instead of raw provider order', async () => {
    setSerpApiFetchOverride(async () => ({
      shopping_results: [
        {
          title: 'Sponsored Organic Spinach Multipack',
          source: 'Whole Foods',
          extracted_price: 2.99,
        },
        {
          title: 'Organic Spinach 5 oz',
          source: 'Whole Foods',
          extracted_price: 3.49,
        },
      ],
    }));

    const result = await searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'organic spinach',
      postal_code: POSTAL_CODE,
      retailer: 'Whole Foods',
    });

    expect(result.outcome).toBe('results');
    expect(result.offers.map((offer) => offer.title)).toEqual([
      'Organic Spinach 5 oz',
      'Sponsored Organic Spinach Multipack',
    ]);
    expect(result.search_provenance).toMatchObject({
      requested_postal_code: POSTAL_CODE,
      retailer: 'Whole Foods',
      scope: 'retailer_localized',
    });
  });

  it('returns market scope when retailer is blank', async () => {
    setSerpApiFetchOverride(async () => ({
      shopping_results: [
        {
          title: 'Organic Baby Spinach 5 oz',
          source: 'Whole Foods',
          extracted_price: 3.49,
        },
      ],
    }));

    const result = await searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'organic spinach',
      postal_code: POSTAL_CODE,
    });

    expect(result.search_provenance?.scope).toBe('market');
    expect(result.search_provenance?.retailer).toBeNull();
  });

  it('returns normalized offers without requiring grocery item scope', async () => {
    setSerpApiFetchOverride(async () => ({
      shopping_results: [
        {
          title: 'Organic Baby Spinach 5 oz',
          source: 'Whole Foods',
          extracted_price: 3.49,
        },
      ],
    }));

    const result = await searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'organic spinach',
      postal_code: POSTAL_CODE,
      retailer: 'Whole Foods',
    });

    expect(result.outcome).toBe('results');
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      title: 'Organic Baby Spinach 5 oz',
      retailer: 'Whole Foods',
      price: 3.49,
      currency: 'USD',
    });
  });

  it('returns zero_results when provider yields no candidates', async () => {
    setSerpApiFetchOverride(async () => ({ shopping_results: [] }));

    const result = await searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'mystery item',
      postal_code: POSTAL_CODE,
    });

    expect(result.outcome).toBe('zero_results');
    expect(result.offers).toEqual([]);
  });

  it('returns provider_error without throwing', async () => {
    setSerpApiFetchOverride(async () => ({ error: 'quota exceeded upstream' }));

    const result = await searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'spinach',
      postal_code: POSTAL_CODE,
    });

    expect(result.outcome).toBe('provider_error');
    expect(result.provider_error?.code).toBe('provider_error');
  });

  it('returns provider_error and releases quota when Pantry timeout elapses', async () => {
    jest.useFakeTimers();
    setPantryProductSearchTimeoutMsOverride(50);
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

    const promise = searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'spinach',
      postal_code: POSTAL_CODE,
    });
    await jest.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result.outcome).toBe('provider_error');
    expect(result.provider_error?.code).toBe('timeout');
    expect(mockFinalizeQuotaClaim).toHaveBeenCalledWith({
      claimId: 'claim-1',
      status: 'released',
    });
    expect(mockFinalizeQuotaClaim).not.toHaveBeenCalledWith({
      claimId: 'claim-1',
      status: 'billed',
    });
  });

  it('returns resolved provider location in search provenance', async () => {
    setSerpApiFetchOverride(async () => ({
      shopping_results: [
        {
          title: 'Organic Baby Spinach 5 oz',
          source: 'Whole Foods',
          extracted_price: 3.49,
        },
      ],
    }));

    const result = await searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'spinach',
      postal_code: POSTAL_CODE,
    });

    expect(result.search_provenance?.resolved_provider_location).toBe(
      '94110, California, United States',
    );
  });
});
