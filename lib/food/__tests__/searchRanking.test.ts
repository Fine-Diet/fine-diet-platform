// Mock supabaseAdmin so foodServerService import doesn't throw on missing env
// vars in the test environment. These pure-helper tests don't actually exercise
// the DB; the goldenSearchRegression suite covers integration with mocked DB.
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    })),
  },
}));

jest.mock('@/lib/missingItems/missingItemRequestServerService', () => ({
  recordMissingItemRequest: jest.fn().mockResolvedValue(undefined),
}));

import {
  buildRankingSignals,
  compareFallbackRanking,
  findPreferredUsableFallbackMatch,
  narrowResultsForSpecificQuery,
  offMirrorRowToSearchResult,
  pruneAnalyticalRowsForYogurtBrandQuery,
  pruneFallbackPackForSpecificQuery,
  promotedOffRowToSearchResult,
} from '../foodServerService';
import type { FoodSearchResult } from '../types';
import { normalizeSearchQuery } from '../searchNormalization';

function makeFallbackResult(
  name: string,
  overrides: Partial<FoodSearchResult['rankingSignals']> = {}
): FoodSearchResult {
  return {
    food: {
      id: name,
      canonicalName: name,
      brandName: null,
      aliases: [],
      sourceType: 'common',
      sourceProvider: 'off',
      sourceId: name,
      sourceDataset: null,
      upc: null,
      servingSizeG: 100,
      servingUnit: 'g',
      servingDescription: '100g',
      householdServingText: null,
      measures: null,
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
      nutrients: null,
      nutrientsExtended: {},
      nutrientProvenance: 'label',
      nutrientConfidence: 'low',
      personId: null,
      isVerified: false,
      imageUrl: null,
      category: null,
      tags: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    group: 'common',
    score: 0,
    isFavorite: false,
    logCount: 0,
    source: 'off',
    source_label: 'Open Food Facts',
    source_rank: 10,
    tokenMatchCount: 1,
    brandGroupHits: 0,
    matchedVariants: [name],
    rankingSignals: {
      ...buildRankingSignals({
        trustRank: 10,
        fallbackState: 'fallback_off',
        nutritionConfidence: 'low',
        scoreReadiness: 'low',
        readinessBasis: 'off_completeness',
        nutritionCompletenessScore: 1,
        hasMacros: false,
        nutritionBasis: 'per_100g',
        servingConfidence: 'low',
      }),
      ...overrides,
    },
  };
}

describe('fallback ranking policy', () => {
  it('prefers nutritionally usable fallback entries over thin entries', () => {
    const usable = makeFallbackResult('Usable', {
      nutritionConfidence: 'medium',
      nutritionCompletenessScore: 4,
      nutritionQualityTier: 'usable',
      nutritionallyUsable: true,
      scoreReadiness: 'medium',
    });
    const thin = makeFallbackResult('Thin', {
      nutritionConfidence: 'low',
      nutritionCompletenessScore: 1,
      nutritionQualityTier: 'thin',
      nutritionallyUsable: false,
      scoreReadiness: 'low',
    });

    const sorted = [thin, usable].sort(compareFallbackRanking);
    expect(sorted[0].food.canonicalName).toBe('Usable');
  });

  it('uses completeness as a deterministic tie-breaker inside fallback quality tiers', () => {
    const stronger = makeFallbackResult('Stronger', {
      nutritionConfidence: 'medium',
      nutritionCompletenessScore: 5,
      nutritionQualityTier: 'usable',
      nutritionallyUsable: true,
      scoreReadiness: 'high',
    });
    const weaker = makeFallbackResult('Weaker', {
      nutritionConfidence: 'medium',
      nutritionCompletenessScore: 3,
      nutritionQualityTier: 'usable',
      nutritionallyUsable: true,
      scoreReadiness: 'medium',
    });

    const sorted = [weaker, stronger].sort(compareFallbackRanking);
    expect(sorted[0].food.canonicalName).toBe('Stronger');
  });

  it('lets clearly better lexical fallback matches outrank weaker lexical matches', () => {
    const exactish = makeFallbackResult('Exactish');
    exactish.score = 500;
    exactish.tokenMatchCount = 5;

    const genericUsable = makeFallbackResult('Generic Usable', {
      nutritionConfidence: 'medium',
      nutritionCompletenessScore: 5,
      nutritionQualityTier: 'usable',
      nutritionallyUsable: true,
      scoreReadiness: 'high',
    });
    genericUsable.score = 120;
    genericUsable.tokenMatchCount = 1;

    const sorted = [genericUsable, exactish].sort(compareFallbackRanking);
    expect(sorted[0].food.canonicalName).toBe('Exactish');
  });

  it('keeps only full-match fallback rows when a specific multi-token fallback match exists', () => {
    const { tokenGroups } = normalizeSearchQuery('amylu mini');

    const exact = makeFallbackResult('Breakfast Time Chicken Mini Links');
    exact.tokenMatchCount = 2;
    exact.brandGroupHits = 1;

    const noisy = makeFallbackResult('Mini Robin Eggs');
    noisy.tokenMatchCount = 1;
    noisy.brandGroupHits = 0;

    const narrowed = narrowResultsForSpecificQuery([noisy, exact], tokenGroups, true);
    expect(narrowed.map((result) => result.food.canonicalName)).toEqual([
      'Breakfast Time Chicken Mini Links',
    ]);
  });

  it('prefers the strongest branded token pack when no row matches every token', () => {
    const { tokenGroups } = normalizeSearchQuery('amylu breakfast links');

    const strongerBrand = makeFallbackResult('Amylu Chicken Breakfast Links');
    strongerBrand.tokenMatchCount = 2;
    strongerBrand.brandGroupHits = 1;

    const weakerGeneric = makeFallbackResult('Chicken Breakfast Bowl');
    weakerGeneric.tokenMatchCount = 2;
    weakerGeneric.brandGroupHits = 0;

    const narrowed = narrowResultsForSpecificQuery([weakerGeneric, strongerBrand], tokenGroups, true);
    expect(narrowed.map((result) => result.food.canonicalName)).toEqual([
      'Amylu Chicken Breakfast Links',
    ]);
  });

  it('removes unrelated fallback-pack rows when brand-specific candidates exist', () => {
    const { tokenGroups } = normalizeSearchQuery('amylu mini');

    const brandMatched = makeFallbackResult('Breakfast Time Chicken Mini Links');
    brandMatched.brandGroupHits = 1;
    brandMatched.tokenMatchCount = 2;
    brandMatched.food.brandName = 'Amylu Foods LLC';

    const unrelated = makeFallbackResult('Mini Donuts');
    unrelated.brandGroupHits = 0;
    unrelated.tokenMatchCount = 1;

    const pruned = pruneFallbackPackForSpecificQuery([brandMatched, unrelated], tokenGroups, 'amylu mini');
    expect(pruned.map((result) => result.food.canonicalName)).toEqual([
      'Breakfast Time Chicken Mini Links',
    ]);
  });

  it('keeps only near-exact brand-matched fallback rows for exact product queries', () => {
    const { tokenGroups } = normalizeSearchQuery('Amylu Breakfast Time Chicken Mini Links');

    const intended = makeFallbackResult('Breakfast Time Chicken Mini Links');
    intended.brandGroupHits = 1;
    intended.tokenMatchCount = 6;
    intended.food.brandName = 'Amylu Foods LLC';

    const relatedButBroader = makeFallbackResult('Chicken Breakfast Sausage Links');
    relatedButBroader.brandGroupHits = 1;
    relatedButBroader.tokenMatchCount = 3;
    relatedButBroader.food.brandName = 'Amylu Foods LLC';

    const pruned = pruneFallbackPackForSpecificQuery(
      [relatedButBroader, intended],
      tokenGroups,
      'Amylu Breakfast Time Chicken Mini Links'
    );
    expect(pruned.map((result) => result.food.canonicalName)).toEqual([
      'Breakfast Time Chicken Mini Links',
    ]);
  });

  it('suppresses analytical yogurt rows when edible brand-matched rows exist', () => {
    const { tokenGroups } = normalizeSearchQuery('chob greek yogurt');

    const edible = makeFallbackResult('Yogurt, Greek, 2% Fat, Mango');
    edible.brandGroupHits = 1;
    edible.tokenMatchCount = 3;
    edible.food.brandName = 'Chobani';

    const analytical = makeFallbackResult('Proximates, Greek yogurt, Chobani');
    analytical.brandGroupHits = 1;
    analytical.tokenMatchCount = 3;
    analytical.food.brandName = 'Chobani';

    const pruned = pruneAnalyticalRowsForYogurtBrandQuery([analytical, edible], tokenGroups);
    expect(pruned.map((result) => result.food.canonicalName)).toEqual([
      'Yogurt, Greek, 2% Fat, Mango',
    ]);
  });

  it.each([
    'Amylu Breakfast Time Chicken Mini Links',
    'Breakfast Time Chicken Mini Links Amylu',
    'Amylu savory chicken mini link',
  ])('prefers the same usable Amylu fallback regardless of brand token position: %s', (query) => {
    const thinCurated = makeFallbackResult('Chicken mini link', {
      nutritionQualityTier: 'thin',
      nutritionallyUsable: false,
    });
    thinCurated.source = 'curated';
    thinCurated.source_rank = 2;
    thinCurated.tokenMatchCount = 4;
    thinCurated.brandGroupHits = 1;
    thinCurated.food.brandName = 'Amylu Foods LLC';
    thinCurated.food.sourceProvider = 'fdc';

    const usableOff = makeFallbackResult('Breakfast Time Chicken Mini Links', {
      nutritionConfidence: 'medium',
      nutritionCompletenessScore: 5,
      nutritionQualityTier: 'usable',
      nutritionallyUsable: true,
      scoreReadiness: 'high',
    });
    usableOff.tokenMatchCount = 6;
    usableOff.brandGroupHits = 1;
    usableOff.food.brandName = 'Amylu';

    const preferred = findPreferredUsableFallbackMatch(query, [thinCurated], [usableOff]);
    expect(preferred?.food.canonicalName).toBe('Breakfast Time Chicken Mini Links');
  });

  // Phase D retired the hardcoded Amylu same-item registry. Phase E
  // removed the export entirely. Same-item OFF reachability is proven
  // organically via UPC equivalence (`lib/food/sameItem.proveSameItem`)
  // and the end-to-end coverage lives in `goldenSearchRegression.test.ts`.
});

describe('OFF search result semantics', () => {
  it('marks raw OFF rows as fallback_off with explicit nutrition signals', () => {
    const result = offMirrorRowToSearchResult({
      off_product_id: 'off-1',
      product_name: 'Protein Yogurt',
      generic_name: null,
      brands: 'Example Brand',
      barcode: '123',
      serving_size: '170g',
      quantity: null,
      energy_kcal_100g: 90,
      protein_g_100g: 10,
      carbs_g_100g: 4,
      fat_g_100g: 0,
      fiber_g_100g: null,
      sugars_g_100g: 3,
      sodium_mg_100g: 60,
      image_front_url: null,
      image_url: null,
    });

    expect(result.source).toBe('off');
    expect(result.source_rank).toBe(10);
    expect(result.rankingSignals?.fallbackState).toBe('fallback_off');
    expect(result.rankingSignals?.nutritionQualityTier).toBe('usable');
    expect(result.rankingSignals?.nutritionallyUsable).toBe(true);
    expect(result.rankingSignals?.nutritionBasis).toBe('per_100g');
  });

  it('marks promoted OFF rows as fallback_promoted_off and preserves higher trust rank', () => {
    const result = promotedOffRowToSearchResult({
      id: 'promo-1',
      off_product_id: 'off-2',
      product_name: 'Reviewed Oats',
      brands: null,
      barcode: null,
      serving_size_text: '40g',
      serving_size_g: 40,
      calories_per_100g: 380,
      protein_g_100g: 13,
      carbs_g_100g: 67,
      fat_g_100g: 7,
      fiber_g_100g: 10,
      sugars_g_100g: 1,
      sodium_mg_100g: 5,
      completeness_score: 5,
    });

    expect(result.source).toBe('promoted_off');
    expect(result.source_rank).toBe(5);
    expect(result.rankingSignals?.fallbackState).toBe('fallback_promoted_off');
    expect(result.rankingSignals?.nutritionQualityTier).toBe('strong');
    expect(result.rankingSignals?.nutritionallyUsable).toBe(true);
  });
});
