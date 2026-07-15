import { buildGroceryPriceCacheKey } from '../groceryPriceCache';
import type { GroceryPriceSearchContext } from '../groceryPriceProviderTypes';

const BASE: GroceryPriceSearchContext = {
  food_object_id: 'food-abc',
  canonical_name: 'Greek Yogurt',
  brand_name: 'Chobani',
  upc: '123456789012',
  image_url: null,
  serving_description: null,
  required_ingredient_name: 'greek yogurt',
  required_quantity: 1,
  required_unit: 'cup',
  preferred_product: 'Plain Greek Yogurt',
  purchase_quantity: 32,
  purchase_unit: 'oz',
  retailer: 'Target',
  postal_code: '10001',
};

describe('groceryPriceCache', () => {
  it('produces stable cache keys for identical normalized inputs', () => {
    const a = buildGroceryPriceCacheKey(BASE);
    const b = buildGroceryPriceCacheKey({
      ...BASE,
      retailer: '  target ',
      postal_code: '10001',
    });
    expect(a).toBe(b);
    expect(a.startsWith('gps:v1:')).toBe(true);
  });

  it('changes cache keys when retailer or location changes', () => {
    const retailerChanged = buildGroceryPriceCacheKey({ ...BASE, retailer: 'Walmart' });
    const zipChanged = buildGroceryPriceCacheKey({ ...BASE, postal_code: '94110' });
    expect(retailerChanged).not.toBe(buildGroceryPriceCacheKey(BASE));
    expect(zipChanged).not.toBe(buildGroceryPriceCacheKey(BASE));
  });
});
