import {
  fetchPantryProductSearch,
  PANTRY_PRODUCT_SEARCH_INVALID_RESPONSE_MESSAGE,
  PANTRY_PRODUCT_SEARCH_UNAVAILABLE_MESSAGE,
  PantryProductSearchQuotaExceededError,
} from '../pantryProductSearchClient';

const BASE_QUOTA = {
  tier: 'demo' as const,
  access_mode: 'demo' as const,
  limit: 3,
  used: 1,
  remaining: 2,
  reset_at: null,
  consumed_this_request: false,
  upgrade_required: false,
};

const VALID_OFFER = {
  provider_result_id: 'offer-1',
  title: 'Organic Spinach',
  retailer: 'Whole Foods',
  price: 3.49,
  currency: 'USD',
  package_size: 5,
  package_unit: 'oz',
  package_text: '5 oz',
  image_url: null,
};

function mockFetch(status: number, body: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    json: async () => body,
  } as Response);
}

describe('fetchPantryProductSearch', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns a valid 200 results payload', async () => {
    mockFetch(200, {
      outcome: 'results',
      query: 'spinach',
      offers: [VALID_OFFER],
      quota: BASE_QUOTA,
      provider_error: null,
    });

    const result = await fetchPantryProductSearch({ query: 'spinach' });
    expect(result.outcome).toBe('results');
    expect(result.offers).toHaveLength(1);
  });

  it('returns a valid 502 provider_error payload', async () => {
    mockFetch(502, {
      outcome: 'provider_error',
      query: 'spinach',
      offers: [],
      quota: BASE_QUOTA,
      provider_error: { code: 'timeout', message: 'Timed out' },
    });

    const result = await fetchPantryProductSearch({ query: 'spinach' });
    expect(result.outcome).toBe('provider_error');
    expect(result.provider_error?.code).toBe('timeout');
  });

  it('throws a controlled message for generic 502 JSON', async () => {
    mockFetch(502, { error: 'Bad Gateway' });

    await expect(fetchPantryProductSearch({ query: 'spinach' })).rejects.toThrow(
      PANTRY_PRODUCT_SEARCH_UNAVAILABLE_MESSAGE,
    );
  });

  it('rejects malformed 200 payloads without offers', async () => {
    mockFetch(200, {
      outcome: 'results',
      query: 'spinach',
      quota: BASE_QUOTA,
      provider_error: null,
    });

    await expect(fetchPantryProductSearch({ query: 'spinach' })).rejects.toThrow(
      PANTRY_PRODUCT_SEARCH_INVALID_RESPONSE_MESSAGE,
    );
  });

  it('still throws PantryProductSearchQuotaExceededError for 429', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 429,
      json: async () => ({
        error: 'Product search quota exceeded',
        quota: BASE_QUOTA,
      }),
    });

    await expect(fetchPantryProductSearch({ query: 'spinach' })).rejects.toMatchObject({
      name: 'PantryProductSearchQuotaExceededError',
      message: 'Product search quota exceeded',
      quota: BASE_QUOTA,
    });
  });
});
