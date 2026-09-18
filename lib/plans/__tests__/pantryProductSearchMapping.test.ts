import {
  applyPantryProductOfferToLotDraft,
  toPantryProductSearchOffer,
} from '../pantryProductSearchMapping';
import type { GroceryPriceProviderCandidate } from '../groceryPriceProviderTypes';

function candidate(
  patch: Partial<GroceryPriceProviderCandidate> = {},
): GroceryPriceProviderCandidate {
  return {
    provider: 'serpapi',
    provider_result_id: 'serpapi:0:organic spinach:size-unavailable',
    title: 'Organic Baby Spinach 5 oz',
    retailer: 'Whole Foods',
    price: 3.49,
    currency: 'USD',
    package_text: '5 oz',
    package_size: 5,
    package_unit: 'oz',
    product_url: null,
    image_url: null,
    upc: null,
    is_local: false,
    retrieved_at: '2026-09-18T00:00:00.000Z',
    source_rank: 0,
    match_score: 0,
    match_reasons: [],
    ...patch,
  };
}

describe('pantryProductSearchMapping', () => {
  it('maps provider candidates to pantry-facing offers', () => {
    expect(toPantryProductSearchOffer(candidate())).toEqual({
      provider_result_id: 'serpapi:0:organic spinach:size-unavailable',
      title: 'Organic Baby Spinach 5 oz',
      retailer: 'Whole Foods',
      price: 3.49,
      currency: 'USD',
      package_text: '5 oz',
      package_size: 5,
      package_unit: 'oz',
      image_url: null,
    });
  });

  it('updates only reliable acquisition draft fields and preserves brand/package count', () => {
    const draft = {
      productTitle: 'Spinach',
      brandName: 'Local Farms',
      packageSize: '12',
      packageUnit: 'count',
      packageCount: '2',
      retailer: 'Old Market',
      priceAmount: '1.00',
      currency: 'USD',
    };
    const updated = applyPantryProductOfferToLotDraft(
      draft,
      toPantryProductSearchOffer(candidate({
        package_size: null,
        package_unit: null,
        package_text: null,
      })),
    );

    expect(updated.productTitle).toBe('Organic Baby Spinach 5 oz');
    expect(updated.retailer).toBe('Whole Foods');
    expect(updated.priceAmount).toBe('3.49');
    expect(updated.brandName).toBe('Local Farms');
    expect(updated.packageCount).toBe('2');
    expect(updated.packageSize).toBe('12');
    expect(updated.packageUnit).toBe('count');
  });
});
