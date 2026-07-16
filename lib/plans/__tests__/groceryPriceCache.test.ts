import { buildGroceryPriceCacheKey } from '../groceryPriceCache';
import type { GroceryPriceSearchContext } from '../groceryPriceProviderTypes';

function unresolvedContext(name: string, unit: string): GroceryPriceSearchContext {
  return {
    match_key: `${name.toLowerCase()}::${unit}`,
    food_object_id: null,
    canonical_name: null,
    brand_name: null,
    upc: null,
    image_url: null,
    serving_description: null,
    required_ingredient_name: name,
    required_quantity: 1,
    required_unit: unit,
    preferred_product: null,
    purchase_quantity: null,
    purchase_unit: null,
    retailer: 'Target',
    postal_code: '10001',
  };
}

describe('groceryPriceCache', () => {
  it('produces stable cache keys for identical normalized inputs', () => {
    const base = unresolvedContext('baby spinach', 'cup');
    const a = buildGroceryPriceCacheKey(base);
    const b = buildGroceryPriceCacheKey({
      ...base,
      retailer: '  target ',
    });
    expect(a).toBe(b);
    expect(a.startsWith('gps:v3:')).toBe(true);
  });

  it('isolates unresolved ingredients with different match keys', () => {
    const spinach = buildGroceryPriceCacheKey(unresolvedContext('baby spinach', 'cup'));
    const kale = buildGroceryPriceCacheKey(unresolvedContext('kale', 'cup'));
    expect(spinach).not.toBe(kale);
  });

  it('changes cache keys when retailer or location changes', () => {
    const base = unresolvedContext('baby spinach', 'cup');
    const retailerChanged = buildGroceryPriceCacheKey({ ...base, retailer: 'Walmart' });
    const zipChanged = buildGroceryPriceCacheKey({ ...base, postal_code: '94110' });
    expect(retailerChanged).not.toBe(buildGroceryPriceCacheKey(base));
    expect(zipChanged).not.toBe(buildGroceryPriceCacheKey(base));
  });
});
