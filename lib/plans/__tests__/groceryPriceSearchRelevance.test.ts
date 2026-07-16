import {
  extractProductDefiningTokens,
  filterRelevantGroceryPriceCandidates,
  hasMeaningfulProductTokenOverlap,
  rankGroceryPriceCandidates,
} from '../groceryPriceRanking';
import type { GroceryPriceProviderCandidate, GroceryPriceSearchContext } from '../groceryPriceProviderTypes';

function candidate(partial: Partial<GroceryPriceProviderCandidate>): GroceryPriceProviderCandidate {
  return {
    provider: 'serpapi',
    provider_result_id: partial.provider_result_id ?? 'id-1',
    title: partial.title ?? 'Product',
    retailer: partial.retailer ?? 'Whole Foods Market',
    price: partial.price ?? 4.99,
    currency: 'USD',
    package_text: partial.package_text ?? null,
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

const COD_CONTEXT: GroceryPriceSearchContext = {
  match_key: 'food-cod::lb',
  food_object_id: 'food-cod',
  canonical_name: 'Wild-Caught Cod Fillets',
  brand_name: 'Whole Foods Market',
  upc: '099482477899',
  image_url: null,
  serving_description: null,
  required_ingredient_name: 'cod fillets',
  required_quantity: 1,
  required_unit: 'lb',
  preferred_product: null,
  purchase_quantity: null,
  purchase_unit: null,
  retailer: 'Whole Foods Market',
  postal_code: '94110',
};

const CHOBANI_CONTEXT: GroceryPriceSearchContext = {
  ...COD_CONTEXT,
  match_key: 'food-yogurt::cup',
  food_object_id: 'food-yogurt',
  canonical_name: 'Greek Yogurt',
  brand_name: 'Chobani',
  upc: null,
  required_ingredient_name: 'greek yogurt',
  required_unit: 'cup',
  retailer: 'Kroger',
  postal_code: '10001',
};

const BLUEBERRY_CONTEXT: GroceryPriceSearchContext = {
  ...COD_CONTEXT,
  match_key: 'food-blueberry::cup',
  food_object_id: 'food-blueberry',
  canonical_name: 'Blueberries',
  brand_name: 'Whole Foods Market',
  upc: null,
  required_ingredient_name: 'blueberries',
  required_unit: 'cup',
  retailer: 'Whole Foods Market',
};

describe('grocery price relevance', () => {
  it('requires cod/fillet overlap for Wild-Caught Cod Fillets', () => {
    expect(hasMeaningfulProductTokenOverlap(COD_CONTEXT, 'Whole Foods Wild Caught Cod Fillets')).toBe(true);
    expect(hasMeaningfulProductTokenOverlap(COD_CONTEXT, '365 Organic Hummus')).toBe(false);
    expect(hasMeaningfulProductTokenOverlap(COD_CONTEXT, 'Whole Foods Market Olive Oil')).toBe(false);
    expect(hasMeaningfulProductTokenOverlap(COD_CONTEXT, 'Whole Foods Organic Pasta')).toBe(false);
  });

  it('filters unrelated Whole Foods products for cod search', () => {
    const filtered = filterRelevantGroceryPriceCandidates(COD_CONTEXT, [
      candidate({ provider_result_id: 'hummus', title: '365 Organic Hummus' }),
      candidate({ provider_result_id: 'oil', title: 'Whole Foods Market Olive Oil' }),
      candidate({ provider_result_id: 'pasta', title: 'Whole Foods Organic Pasta' }),
      candidate({
        provider_result_id: 'cod',
        title: 'Whole Foods Market Wild Caught Cod Fillets',
      }),
    ]);
    expect(filtered.map((row) => row.provider_result_id)).toEqual(['cod']);
  });

  it('does not rank Whole Foods brand overlap alone for unrelated products', () => {
    const ranked = rankGroceryPriceCandidates(COD_CONTEXT, [
      candidate({ provider_result_id: 'hummus', title: 'Whole Foods Organic Hummus' }),
      candidate({
        provider_result_id: 'cod',
        title: 'Whole Foods Market Wild Caught Cod Fillets',
        price: 12.99,
      }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].provider_result_id).toBe('cod');
  });

  it('supports Chobani + Greek Yogurt and Whole Foods + Blueberries examples', () => {
    expect(extractProductDefiningTokens(CHOBANI_CONTEXT)).toEqual(
      expect.arrayContaining(['greek', 'yogurt']),
    );
    expect(hasMeaningfulProductTokenOverlap(CHOBANI_CONTEXT, 'Chobani Plain Greek Yogurt')).toBe(true);
    expect(hasMeaningfulProductTokenOverlap(BLUEBERRY_CONTEXT, 'Whole Foods Organic Blueberries')).toBe(true);
    expect(hasMeaningfulProductTokenOverlap(BLUEBERRY_CONTEXT, 'Whole Foods Market Olive Oil')).toBe(false);
  });
});
