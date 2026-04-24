import {
  buildRankingSignals,
  compareFallbackRanking,
  offMirrorRowToSearchResult,
  promotedOffRowToSearchResult,
} from '../foodServerService';
import type { FoodSearchResult } from '../types';

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
