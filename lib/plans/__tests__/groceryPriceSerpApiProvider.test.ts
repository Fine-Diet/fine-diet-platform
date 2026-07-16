import {
  buildSerpApiQueries,
  buildSerpApiSearchParams,
  formatSerpApiHttpError,
  getLastSerpApiRequestDiagnostics,
  normalizeSerpApiShoppingResults,
  resolveSerpApiLocation,
  searchWithQueryFallback,
  serpApiGroceryPriceProvider,
  setSerpApiFetchOverride,
  setSerpApiProviderTimeoutMsOverride,
} from '../groceryPriceSerpApiProvider';
import { GroceryPriceProviderError } from '../groceryPriceProviderTypes';
import type { GroceryPriceSearchContext } from '../groceryPriceProviderTypes';
import {
  SERPAPI_EMPTY_FIXTURE,
  SERPAPI_SPINACH_FIXTURE,
} from './fixtures/serpApiShoppingFixtures';

const BASE_CONTEXT: GroceryPriceSearchContext = {
  match_key: 'food-1::cup',
  food_object_id: 'food-1',
  canonical_name: 'Baby Spinach',
  brand_name: 'Organic Girl',
  upc: '085412000123',
  image_url: null,
  serving_description: '1 cup',
  required_ingredient_name: 'baby spinach',
  required_quantity: 2,
  required_unit: 'cup',
  preferred_product: 'Organic Girl Baby Spinach',
  purchase_quantity: 5,
  purchase_unit: 'oz',
  retailer: 'Whole Foods Market',
  postal_code: '94110',
};

describe('groceryPriceSerpApiProvider', () => {
  afterEach(() => {
    setSerpApiFetchOverride(null);
    setSerpApiProviderTimeoutMsOverride(null);
    jest.useRealTimers();
  });

  it('builds query fallback order with UPC first', () => {
    const queries = buildSerpApiQueries(BASE_CONTEXT);
    expect(queries.map((q) => q.strategy)).toEqual([
      'upc_retailer',
      'exact_brand_product_package_retailer',
      'brand_product_retailer',
      'ingredient_fallback_retailer',
    ]);
  });

  it('returns results when a later strategy succeeds', async () => {
    setSerpApiFetchOverride(async (url) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      if (q.includes('085412000123')) return SERPAPI_EMPTY_FIXTURE;
      return SERPAPI_SPINACH_FIXTURE;
    });

    const outcome = await searchWithQueryFallback(BASE_CONTEXT);
    expect(outcome.kind).toBe('results');
    if (outcome.kind === 'results') {
      expect(outcome.result.candidates.length).toBeGreaterThan(0);
    }
  });

  it('returns zero_results only when strategies complete with no candidates', async () => {
    setSerpApiFetchOverride(async () => SERPAPI_EMPTY_FIXTURE);
    const outcome = await searchWithQueryFallback(BASE_CONTEXT);
    expect(outcome).toEqual({ kind: 'zero_results' });
  });

  it('throws provider_error when all strategies fail', async () => {
    setSerpApiFetchOverride(async () => {
      throw new GroceryPriceProviderError('timeout', 'timed out');
    });

    await expect(searchWithQueryFallback(BASE_CONTEXT)).rejects.toThrow('timed out');
  });

  it('resolves canonical SerpAPI locations from US ZIP codes', () => {
    expect(resolveSerpApiLocation('94110')).toBe('San Francisco, California, United States');
    expect(resolveSerpApiLocation('94196')).toBe('San Francisco, California, United States');
    expect(resolveSerpApiLocation('10001')).toBe('New York, New York, United States');
  });

  it('returns null for unresolved postal codes', () => {
    expect(resolveSerpApiLocation('99999')).toBeNull();
    expect(resolveSerpApiLocation('')).toBeNull();
  });

  it('preserves already-canonical location strings', () => {
    expect(resolveSerpApiLocation('Austin, Texas, United States')).toBe(
      'Austin, Texas, United States',
    );
  });

  it('omits location from SerpAPI params when postal code cannot be resolved', () => {
    const params = buildSerpApiSearchParams(
      { strategy: 'ingredient_fallback_retailer', query: 'spinach Whole Foods' },
      { ...BASE_CONTEXT, postal_code: '99999' },
      'test-api-key',
    );

    expect(params.get('location')).toBeNull();
    expect(params.get('q')).toBe('spinach Whole Foods');
    expect(params.get('api_key')).toBe('test-api-key');
  });

  it('uses canonical location instead of raw ZIP in SerpAPI params', () => {
    const params = buildSerpApiSearchParams(
      { strategy: 'upc_retailer', query: '085412000123 Whole Foods Market' },
      BASE_CONTEXT,
      'test-api-key',
    );

    expect(params.get('location')).toBe('San Francisco, California, United States');
    expect(params.get('location')).not.toBe('94110');
  });

  it('formats safe SerpAPI HTTP error details without leaking secrets', () => {
    expect(
      formatSerpApiHttpError(400, {
        error: 'Unsupported location: 94196. api_key=super-secret-key-value',
      }),
    ).toBe('SerpAPI request failed (400): Unsupported location: 94196. api_key=[redacted]');

    expect(formatSerpApiHttpError(502, {})).toBe('SerpAPI request failed (502)');
  });

  it('surfaces safe HTTP error details from provider responses', async () => {
    setSerpApiFetchOverride(async () => {
      throw new GroceryPriceProviderError(
        'provider_error',
        'SerpAPI request failed (400): Unsupported `location` parameter.',
      );
    });

    await expect(
      serpApiGroceryPriceProvider.search(BASE_CONTEXT, {
        strategy: 'upc_retailer',
        query: '085412000123 Whole Foods Market',
      }),
    ).rejects.toMatchObject({
      code: 'provider_error',
      message: expect.stringContaining('Unsupported `location` parameter'),
    });
  });

  it('records provider timeout diagnostics without changing the app default', async () => {
    jest.useFakeTimers();
    setSerpApiFetchOverride((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    );
    setSerpApiProviderTimeoutMsOverride(250);

    const promise = serpApiGroceryPriceProvider.search(BASE_CONTEXT, {
      strategy: 'upc_retailer',
      query: '085412000123 Whole Foods Market',
    });
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'timeout',
      message: expect.stringMatching(/abort_source=provider_timeout/),
    });
    await jest.advanceTimersByTimeAsync(250);
    await expectation;
    expect(getLastSerpApiRequestDiagnostics()).toMatchObject({
      configured_timeout_ms: 250,
      abort_source: 'provider_timeout',
    });
    expect(getLastSerpApiRequestDiagnostics()?.elapsed_ms).toBeGreaterThanOrEqual(250);
  });

  it('normalizes SerpAPI shopping results', () => {
    const normalized = normalizeSerpApiShoppingResults(
      SERPAPI_SPINACH_FIXTURE,
      'Whole Foods Market',
      '2026-07-15T00:00:00.000Z',
    );
    expect(normalized[0]).toMatchObject({
      title: 'Organic Girl Baby Spinach 5 oz',
      price: 3.99,
      is_local: true,
    });
  });
});
