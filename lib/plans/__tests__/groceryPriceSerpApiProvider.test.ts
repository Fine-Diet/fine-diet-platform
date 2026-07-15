import {
  buildSerpApiQueries,
  normalizeSerpApiShoppingResults,
  searchWithQueryFallback,
  setSerpApiFetchOverride,
} from '../groceryPriceSerpApiProvider';
import type { GroceryPriceSearchContext } from '../groceryPriceProviderTypes';
import {
  SERPAPI_EMPTY_FIXTURE,
  SERPAPI_SPINACH_FIXTURE,
  SERPAPI_UPC_FIXTURE,
} from './fixtures/serpApiShoppingFixtures';

const BASE_CONTEXT: GroceryPriceSearchContext = {
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
    expect(queries[0].query).toContain('085412000123');
  });

  it('normalizes SerpAPI shopping results without leaking raw payload fields', () => {
    const normalized = normalizeSerpApiShoppingResults(
      SERPAPI_SPINACH_FIXTURE,
      'Whole Foods Market',
      '2026-07-15T00:00:00.000Z',
    );
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      provider: 'serpapi',
      title: 'Organic Girl Baby Spinach 5 oz',
      retailer: 'Whole Foods Market',
      price: 3.99,
      currency: 'USD',
      is_local: true,
    });
    expect(normalized[0].product_url).toBe('https://example.com/spinach');
  });

  it('uses query fallback until a strategy returns candidates', async () => {
    const calls: string[] = [];
    setSerpApiFetchOverride(async (url) => {
      const parsed = new URL(url);
      const q = parsed.searchParams.get('q') ?? '';
      calls.push(q);
      if (q.includes('085412000123')) return SERPAPI_EMPTY_FIXTURE;
      if (q.includes('Organic Girl')) return SERPAPI_SPINACH_FIXTURE;
      return SERPAPI_EMPTY_FIXTURE;
    });

    const result = await searchWithQueryFallback(BASE_CONTEXT);
    expect(result?.strategy).toBe('exact_brand_product_package_retailer');
    expect(result?.candidates.length).toBeGreaterThan(0);
    expect(calls.length).toBeGreaterThan(1);
  });

  it('returns null when all fallback queries are empty', async () => {
    setSerpApiFetchOverride(async () => SERPAPI_EMPTY_FIXTURE);
    const result = await searchWithQueryFallback(BASE_CONTEXT);
    expect(result).toBeNull();
  });

  it('normalizes UPC-bearing results for ranking', () => {
    const normalized = normalizeSerpApiShoppingResults(
      SERPAPI_UPC_FIXTURE,
      'Target',
      '2026-07-15T00:00:00.000Z',
    );
    expect(normalized[0].upc).toBe('036632085412');
  });
});
