import { rankGroceryPriceCandidates } from '../groceryPriceRanking';
import type { GroceryPriceProviderCandidate, GroceryPriceSearchContext } from '../groceryPriceProviderTypes';

const CONTEXT: GroceryPriceSearchContext = {
  food_object_id: 'food-1',
  canonical_name: 'Baby Spinach',
  brand_name: 'Organic Girl',
  upc: '085412000123',
  image_url: null,
  serving_description: null,
  required_ingredient_name: 'baby spinach',
  required_quantity: 2,
  required_unit: 'cup',
  preferred_product: 'Organic Girl Baby Spinach 5 oz',
  purchase_quantity: 5,
  purchase_unit: 'oz',
  retailer: 'Whole Foods Market',
  postal_code: '94110',
};

function candidate(partial: Partial<GroceryPriceProviderCandidate>): GroceryPriceProviderCandidate {
  return {
    provider: 'serpapi',
    provider_result_id: partial.provider_result_id ?? 'id-1',
    title: partial.title ?? 'Organic Girl Baby Spinach 5 oz',
    retailer: partial.retailer ?? 'Whole Foods Market',
    price: partial.price ?? 3.99,
    currency: 'USD',
    package_text: partial.package_text ?? '5 oz',
    product_url: null,
    image_url: null,
    upc: partial.upc ?? null,
    is_local: partial.is_local ?? false,
    retrieved_at: '2026-07-15T00:00:00.000Z',
    source_rank: 0,
    match_score: 0,
    match_reasons: [],
    ...partial,
  };
}

describe('groceryPriceRanking', () => {
  it('ranks exact UPC and retailer matches highest with transparent reasons', () => {
    const ranked = rankGroceryPriceCandidates(CONTEXT, [
      candidate({
        provider_result_id: 'low',
        title: 'Random Greens Multipack',
        retailer: 'Other Store',
        upc: null,
        price: 2.5,
      }),
      candidate({
        provider_result_id: 'high',
        title: 'Organic Girl Baby Spinach 5 oz',
        upc: '085412000123',
        is_local: true,
        price: 3.99,
      }),
    ]);

    expect(ranked[0].provider_result_id).toBe('high');
    expect(ranked[0].match_reasons).toEqual(
      expect.arrayContaining(['exact_upc_match', 'retailer_match', 'brand_match']),
    );
    expect(ranked[0].match_score).toBeGreaterThan(ranked[1].match_score);
  });

  it('penalizes sponsored and multipack noise', () => {
    const clean = candidate({ provider_result_id: 'clean', title: 'Organic Girl Baby Spinach 5 oz' });
    const noisy = candidate({
      provider_result_id: 'noisy',
      title: 'Sponsored Organic Girl Baby Spinach Multipack',
      match_reasons: [],
    });
    const ranked = rankGroceryPriceCandidates(CONTEXT, [noisy, clean]);
    expect(ranked[0].provider_result_id).toBe('clean');
    expect(ranked[1].match_reasons).toEqual(
      expect.arrayContaining(['sponsored_penalty', 'multipack_penalty']),
    );
  });
});
