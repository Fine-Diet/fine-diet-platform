import {
  buildBrandProductRetailerQuery,
  dedupeQueryTerms,
  isEquivalentBrandRetailer,
  resolvePrimaryProductName,
} from '../groceryPriceSearchQuery';
import type { GroceryPriceSearchContext } from '../groceryPriceProviderTypes';

describe('groceryPriceSearchQuery', () => {
  it('deduplicates equivalent brand and retailer text in queries', () => {
    expect(
      buildBrandProductRetailerQuery({
        brand_name: 'Whole Foods Market',
        product_name: 'Wild-Caught Cod Fillets',
        retailer: 'Whole Foods Market',
      }),
    ).toBe('Whole Foods Market Wild-Caught Cod Fillets');
  });

  it('keeps distinct brand and retailer in the query', () => {
    expect(
      buildBrandProductRetailerQuery({
        brand_name: 'Chobani',
        product_name: 'Greek Yogurt',
        retailer: 'Kroger',
      }),
    ).toBe('Chobani Greek Yogurt Kroger');
  });

  it('detects equivalent brand and retailer names', () => {
    expect(isEquivalentBrandRetailer('Whole Foods Market', 'Whole Foods Market')).toBe(true);
    expect(isEquivalentBrandRetailer('Chobani', 'Kroger')).toBe(false);
  });

  it('resolves canonical product name before preferred product', () => {
    const context = {
      canonical_name: 'Blueberries',
      preferred_product: 'Organic Blueberries',
      required_ingredient_name: 'berries',
    } satisfies Pick<GroceryPriceSearchContext, 'canonical_name' | 'preferred_product' | 'required_ingredient_name'>;
    expect(resolvePrimaryProductName(context)).toBe('Blueberries');
  });

  it('dedupes repeated query terms case-insensitively', () => {
    expect(
      dedupeQueryTerms(['Whole Foods Market', 'Wild-Caught Cod Fillets', 'whole foods market']),
    ).toBe('Whole Foods Market Wild-Caught Cod Fillets');
  });
});
