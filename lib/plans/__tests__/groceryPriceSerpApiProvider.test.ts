import {
  buildSerpApiQueries,
  normalizeSerpApiShoppingResults,
  searchWithQueryFallback,
  setSerpApiFetchOverride,
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

    await expect(searchWithQueryFallback(BASE_CONTEXT)).rejects.toThrow('SerpAPI request failed');
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
