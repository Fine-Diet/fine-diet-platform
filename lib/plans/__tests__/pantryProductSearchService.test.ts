import { setSerpApiFetchOverride } from '../groceryPriceSerpApiProvider';

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

import { searchPantryProductDetails } from '../pantryProductSearchService';

const PERSON_ID = 'person-1';

describe('searchPantryProductDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSerpApiFetchOverride(null);
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
  });

  it('rejects blank or too-short queries', async () => {
    await expect(searchPantryProductDetails({
      personId: PERSON_ID,
      query: ' ',
    })).rejects.toThrow('Search query must be at least 2 characters.');
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
    });

    expect(result.outcome).toBe('zero_results');
    expect(result.offers).toEqual([]);
  });

  it('returns provider_error without throwing', async () => {
    setSerpApiFetchOverride(async () => ({ error: 'quota exceeded upstream' }));

    const result = await searchPantryProductDetails({
      personId: PERSON_ID,
      query: 'spinach',
    });

    expect(result.outcome).toBe('provider_error');
    expect(result.provider_error?.code).toBe('provider_error');
  });
});
