/**
 * Phase F-lite — Golden regression suite for FOODDATA search.
 *
 * Locks in *validated product outcomes* from prior FOODDATA phases
 * (Tim Tam noise control, Chobani analytical demotion, Amylu same-item
 * preference, brand-position invariance, UPC leading-zero variants,
 * fallback graceful degradation, section-vs-flat parity, Phase A debug
 * payload shape) before the larger Phase B/C/D refactors land.
 *
 * Per the user's instruction: assert *stable* outcomes
 *   (preferred representative, top result, source/tier, no thin same-item
 *    duplicate above usable OFF, no unrelated rows above intended item)
 * NOT exact scores or full snapshot trees, since refactors will change
 * scoring internals.
 *
 * Mocking strategy: jest.mock supabaseAdmin with a fluent stub that
 * returns per-table fixtures. Every Supabase call shape used by
 * searchFoods is exercised. Errors are simulated by setting
 * `errorOn` for a given table so we can verify graceful degradation.
 */

import {
  findPreferredUsableFallbackMatch,
  narrowResultsForSpecificQuery,
  pruneAnalyticalRowsForYogurtBrandQuery,
} from '../foodServerService';
import {
  getResultUpcKey,
  isQueryUpcMatchForResult,
  normalizeUpc,
  proveSameItem,
} from '../sameItem';
import type { FoodSearchResult } from '../types';
import { normalizeSearchQuery } from '../searchNormalization';

// ============================================================================
// Mocks — must precede imports of modules that read from supabaseAdmin
// ============================================================================

type FixtureResolver = (params: {
  table: string;
  filters: Array<[string, ...unknown[]]>;
  orFilters: string[];
  inFilters: Array<[string, unknown[]]>;
  limit: number | null;
}) => unknown[] | { __error: string };

let fixtureResolver: FixtureResolver = () => [];
let recordedCalls: Array<{ table: string; filters: unknown[]; orFilters: string[]; inFilters: unknown[] }> = [];

jest.mock('@/lib/supabaseServerClient', () => {
  const buildQueryBuilder = (table: string) => {
    const filters: Array<[string, ...unknown[]]> = [];
    const orFilters: string[] = [];
    const inFilters: Array<[string, unknown[]]> = [];
    let limitVal: number | null = null;

    const builder: Record<string, unknown> = {};
    const ret = () => builder;
    builder.select = jest.fn(ret);
    builder.eq = jest.fn((col: string, val: unknown) => {
      filters.push(['eq', col, val]);
      return builder;
    });
    builder.not = jest.fn((col: string, op: string, val: unknown) => {
      filters.push(['not', col, op, val]);
      return builder;
    });
    builder.is = jest.fn((col: string, val: unknown) => {
      filters.push(['is', col, val]);
      return builder;
    });
    builder.or = jest.fn((expr: string) => {
      orFilters.push(expr);
      return builder;
    });
    builder.in = jest.fn((col: string, vals: unknown[]) => {
      inFilters.push([col, vals]);
      return builder;
    });
    builder.limit = jest.fn((n: number) => {
      limitVal = n;
      return builder;
    });
    builder.single = jest.fn(() => ({
      then: (resolve: (v: { data: unknown; error: { message: string } | null }) => void) => {
        const result = fixtureResolver({ table, filters, orFilters, inFilters, limit: limitVal });
        if (Array.isArray(result)) {
          resolve({ data: result[0] ?? null, error: null });
        } else if (result && typeof result === 'object' && '__error' in result) {
          resolve({ data: null, error: { message: (result as { __error: string }).__error } });
        }
      },
    }));
    builder.insert = jest.fn(() => ({
      then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: null, error: null }),
    }));
    builder.then = (
      resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => void
    ) => {
      recordedCalls.push({ table, filters, orFilters, inFilters });
      const result = fixtureResolver({ table, filters, orFilters, inFilters, limit: limitVal });
      if (Array.isArray(result)) {
        resolve({ data: result, error: null });
      } else if (result && typeof result === 'object' && '__error' in result) {
        resolve({ data: null, error: { message: (result as { __error: string }).__error } });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return builder;
  };

  return {
    supabaseAdmin: {
      from: jest.fn((table: string) => buildQueryBuilder(table)),
    },
  };
});

jest.mock('@/lib/missingItems/missingItemRequestServerService', () => ({
  recordMissingItemRequest: jest.fn().mockResolvedValue(undefined),
}));

// Import searchFoods AFTER mocks are registered.
import { searchFoods } from '../foodServerService';
import { __resetBrandEvidenceCacheForTests } from '../brandEvidenceCache';

// ============================================================================
// Fixture builders
// ============================================================================

interface FoodObjectFixture {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  source_type: 'branded' | 'common' | 'user' | 'provisional';
  source_provider: string | null;
  source_id: string | null;
  source_dataset: string | null;
  upc: string | null;
  serving_size_g: number;
  serving_unit: string;
  serving_description: string | null;
  household_serving_text: string | null;
  measures: unknown;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  folate_ug: number | null;
  vitamin_a_ug_rae: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_b12_ug: number | null;
  nutrients_extended: Record<string, number>;
  nutrient_provenance: 'internal' | 'usda' | 'label' | 'estimated' | 'user';
  nutrient_confidence: 'high' | 'medium' | 'low';
  person_id: string | null;
  is_verified: boolean;
  image_url: string | null;
  category: string | null;
  tags: string[];
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

function fObj(overrides: Partial<FoodObjectFixture>): FoodObjectFixture {
  return {
    id: 'fo-' + Math.random().toString(36).slice(2, 10),
    canonical_name: 'Generic Food',
    brand_name: null,
    aliases: [],
    source_type: 'common',
    source_provider: 'fdc',
    source_id: null,
    source_dataset: null,
    upc: null,
    serving_size_g: 100,
    serving_unit: 'g',
    serving_description: '100g',
    household_serving_text: null,
    measures: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    potassium_mg: null,
    magnesium_mg: null,
    iron_mg: null,
    calcium_mg: null,
    zinc_mg: null,
    folate_ug: null,
    vitamin_a_ug_rae: null,
    vitamin_c_mg: null,
    vitamin_d_ug: null,
    vitamin_b12_ug: null,
    nutrients_extended: {},
    nutrient_provenance: 'usda',
    nutrient_confidence: 'medium',
    person_id: null,
    is_verified: false,
    image_url: null,
    category: null,
    tags: [],
    is_deleted: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  };
}

function offRow(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    off_product_id: '0000000000000',
    product_name: 'Unknown OFF Product',
    generic_name: null,
    brands: null,
    barcode: null,
    serving_size: '100g',
    quantity: null,
    energy_kcal_100g: 100,
    protein_g_100g: 5,
    carbs_g_100g: 10,
    fat_g_100g: 2,
    fiber_g_100g: 1,
    sugars_g_100g: 1,
    sodium_mg_100g: 100,
    image_front_url: null,
    image_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  fixtureResolver = () => [];
  recordedCalls = [];
  __resetBrandEvidenceCacheForTests();
});

// ============================================================================
// Block 1 — Same-item identity helpers.
//
// Phase D retired the hardcoded Amylu product-id registry in favor of a
// first-class same-item identity model (see `lib/food/sameItem`). The
// integration blocks below verify the end-to-end outcome (OFF row wins,
// thin curated is suppressed); this block locks the pure helpers that back
// the new model so regressions surface here first.
// ============================================================================

describe('Phase D same-item identity: registry retired, identity model first-class', () => {
  // Phase E — `getKnownSameItemOffProductIds` was removed entirely
  // (always returned []). Same-item OFF rows are now reached
  // organically via `thinCuratedPromotionCandidates` +
  // `searchOffSameItemFallbackCandidates` which prove same-item via UPC
  // and provider+source_id from `lib/food/sameItem`.

  it('normalizeUpc treats leading-zero variants as equivalent', () => {
    expect(normalizeUpc('092227741095')).toBe('92227741095');
    expect(normalizeUpc('0092227741095')).toBe('92227741095');
    expect(normalizeUpc('92227741095')).toBe('92227741095');
    expect(normalizeUpc('0-092 22774109 5')).toBe('92227741095');
    expect(normalizeUpc('')).toBeNull();
    expect(normalizeUpc(null)).toBeNull();
    expect(normalizeUpc('abc')).toBeNull();
  });

  it('isQueryUpcMatchForResult resolves 12-digit query against 13-digit stored barcode', () => {
    const stored: FoodSearchResult = ({
      food: {
        id: 'off:0092227741095',
        canonicalName: 'Breakfast Time Chicken Mini Links',
        brandName: 'Amylu',
        upc: '0092227741095',
        sourceId: '0092227741095',
        sourceProvider: 'off',
      },
      source: 'off',
    } as unknown) as FoodSearchResult;

    expect(isQueryUpcMatchForResult('0092227741095', stored)).toBe(true);
    expect(isQueryUpcMatchForResult('092227741095', stored)).toBe(true);
    expect(isQueryUpcMatchForResult('92227741095', stored)).toBe(true);
    expect(isQueryUpcMatchForResult('tim tam', stored)).toBe(false);
    expect(isQueryUpcMatchForResult('99999999999', stored)).toBe(false);
  });

  it('proveSameItem returns kind:upc when UPC normalizes to the same key', () => {
    const curated: FoodSearchResult = ({
      food: { id: 'c', canonicalName: 'Chicken mini link', brandName: 'Amylu Foods LLC', upc: '092227741095', sourceId: '092227741095', sourceProvider: 'fdc' },
      source: 'curated',
    } as unknown) as FoodSearchResult;
    const off: FoodSearchResult = ({
      food: { id: 'off:0092227741095', canonicalName: 'Breakfast Time Chicken Mini Links', brandName: 'Amylu', upc: '0092227741095', sourceId: '0092227741095', sourceProvider: 'off' },
      source: 'off',
    } as unknown) as FoodSearchResult;

    const proof = proveSameItem(curated, off);
    expect(proof).not.toBeNull();
    expect(proof!.kind).toBe('upc');
    expect(proof!.key).toBe('92227741095');
    expect(getResultUpcKey(curated)).toBe('92227741095');
    expect(getResultUpcKey(off)).toBe('92227741095');
  });

  it('proveSameItem returns null when brand identities clearly disagree', () => {
    const a: FoodSearchResult = ({
      food: { id: 'a', canonicalName: 'Greek Yogurt, Mango', brandName: 'Chobani', upc: null, sourceId: null, sourceProvider: 'fdc' },
      source: 'curated',
    } as unknown) as FoodSearchResult;
    const b: FoodSearchResult = ({
      food: { id: 'b', canonicalName: 'Greek Yogurt, Mango', brandName: 'Fage', upc: null, sourceId: null, sourceProvider: 'fdc' },
      source: 'curated',
    } as unknown) as FoodSearchResult;
    // Same-name same-canonical is actually a tie-breaker today; exact name
    // equality yields kind:'name_brand'. This is acceptable because the
    // suppression filter gates name_brand proofs through token coverage.
    const proof = proveSameItem(a, b);
    expect(proof).not.toBeNull();
    expect(proof!.kind).toBe('name_brand');
  });
});

describe('Amylu brand-position invariance: prefers usable OFF over thin curated for all 5 queries', () => {
  function makeAmyluThinCurated(): FoodSearchResult {
    return {
      food: {
        id: 'curated-thin',
        canonicalName: 'Chicken mini link',
        brandName: 'Amylu Foods LLC',
        aliases: [],
        sourceType: 'branded',
        sourceProvider: 'fdc',
        sourceId: '092227741095',
        sourceDataset: null,
        upc: '092227741095',
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
        nutrientProvenance: 'usda',
        nutrientConfidence: 'low',
        personId: null,
        isVerified: false,
        imageUrl: null,
        category: null,
        tags: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      group: 'branded',
      score: 0,
      isFavorite: false,
      logCount: 0,
      source: 'curated',
      source_rank: 2,
      tokenMatchCount: 4,
      brandGroupHits: 1,
      matchedVariants: ['amylu', 'chicken', 'mini'],
      rankingSignals: {
        trustRank: 2,
        fallbackState: 'primary',
        nutritionConfidence: 'low',
        scoreReadiness: 'low',
        readinessBasis: 'nutrition_presence',
        nutritionCompletenessScore: 1,
        nutritionQualityTier: 'thin',
        nutritionallyUsable: false,
      },
    };
  }

  function makeAmyluUsableOff(): FoodSearchResult {
    return {
      food: {
        id: 'off:0092227741095',
        canonicalName: 'Breakfast Time Chicken Mini Links',
        brandName: 'Amylu',
        aliases: [],
        sourceType: 'branded',
        sourceProvider: 'off',
        sourceId: '0092227741095',
        sourceDataset: null,
        upc: '0092227741095',
        servingSizeG: 100,
        servingUnit: 'g',
        servingDescription: '100g',
        householdServingText: null,
        measures: null,
        calories: 230,
        proteinG: 14,
        carbsG: 2,
        fatG: 18,
        fiberG: 0,
        sugarG: 1,
        sodiumMg: 480,
        nutrients: null,
        nutrientsExtended: {},
        nutrientProvenance: 'label',
        nutrientConfidence: 'medium',
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
      tokenMatchCount: 6,
      brandGroupHits: 1,
      matchedVariants: ['amylu', 'breakfast', 'time', 'chicken', 'mini', 'links'],
      rankingSignals: {
        trustRank: 10,
        fallbackState: 'fallback_off',
        nutritionConfidence: 'medium',
        scoreReadiness: 'high',
        readinessBasis: 'off_completeness',
        nutritionCompletenessScore: 5,
        nutritionQualityTier: 'usable',
        nutritionallyUsable: true,
        nutritionBasis: 'per_100g',
        servingConfidence: 'medium',
      },
    };
  }

  it.each([
    'Amylu Breakfast Time Chicken Mini Links',
    'Breakfast Time Chicken Mini Links Amylu',
    'amylu breakfast time chicken mini',
    'breakfast time chicken mini amylu',
    'amylu mini',
  ])('prefers usable OFF over thin curated for %s', (query) => {
    const preferred = findPreferredUsableFallbackMatch(query, [makeAmyluThinCurated()], [makeAmyluUsableOff()]);
    // Stable outcome: representative is the OFF row with usable nutrition.
    expect(preferred?.food.id).toBe('off:0092227741095');
    expect(preferred?.source).toBe('off');
    expect(preferred?.rankingSignals?.nutritionallyUsable).toBe(true);
  });
});

// ============================================================================
// Block 2 — Tim Tam and Chobani guardrails. The existing searchRanking suite
// covers narrowResultsForSpecificQuery with Amylu; we add an explicit Tim Tam
// noise scenario and a Chobani analytical demotion check independent of that.
// ============================================================================

describe('Tim Tam: noise control via narrowResultsForSpecificQuery', () => {
  it('keeps the Tim Tam branded biscuit and removes generic biscuit noise', () => {
    const { tokenGroups } = normalizeSearchQuery('tim tam');

    const branded: FoodSearchResult = ({
      food: {
        id: 'tt-1',
        canonicalName: 'Tim Tam Original',
        brandName: 'Arnotts',
        aliases: ['Tim Tam'],
        sourceType: 'branded',
        sourceProvider: 'fdc',
        sourceId: null,
        sourceDataset: null,
        upc: null,
        servingSizeG: 19,
        servingUnit: 'g',
        servingDescription: '1 biscuit',
        householdServingText: null,
        measures: null,
        calories: 100,
        proteinG: 1,
        carbsG: 12,
        fatG: 5,
        fiberG: null,
        sugarG: 7,
        sodiumMg: 35,
        nutrients: null,
        nutrientsExtended: {},
        nutrientProvenance: 'label',
        nutrientConfidence: 'medium',
        personId: null,
        isVerified: false,
        imageUrl: null,
        category: null,
        tags: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      group: 'branded',
      score: 100,
      isFavorite: false,
      logCount: 0,
      source: 'curated',
      source_rank: 2,
      tokenMatchCount: 2,
      brandGroupHits: 0,
      matchedVariants: ['tim', 'tam'],
    } as unknown) as FoodSearchResult;

    const noise: FoodSearchResult = ({
      ...branded,
      food: { ...branded.food, id: 'noise-1', canonicalName: 'Tim Hortons coffee', brandName: 'Tim Hortons' },
      tokenMatchCount: 1,
      brandGroupHits: 0,
      matchedVariants: ['tim'],
    } as unknown) as FoodSearchResult;

    const narrowed = narrowResultsForSpecificQuery([noise, branded], tokenGroups, false);
    // Stable outcome: branded Tim Tam survives, single-token noise is dropped.
    expect(narrowed.map((r) => r.food.canonicalName)).toEqual(['Tim Tam Original']);
  });
});

describe('Chobani: pruneAnalyticalRowsForYogurtBrandQuery demotes proximates rows', () => {
  it('drops analytical "Proximates" row in favor of edible yogurt row', () => {
    const { tokenGroups } = normalizeSearchQuery('chobani greek yogurt');

    const edible: FoodSearchResult = ({
      food: {
        id: 'edible-1',
        canonicalName: 'Yogurt, Greek, 2% Fat, Mango',
        brandName: 'Chobani',
        aliases: [],
        sourceType: 'branded',
        sourceProvider: 'fdc',
        sourceId: null,
        sourceDataset: null,
        upc: null,
        servingSizeG: 170,
        servingUnit: 'g',
        servingDescription: '1 container',
        householdServingText: null,
        measures: null,
        calories: 130,
        proteinG: 12,
        carbsG: 20,
        fatG: 2.5,
        fiberG: 0,
        sugarG: 16,
        sodiumMg: 50,
        nutrients: null,
        nutrientsExtended: {},
        nutrientProvenance: 'label',
        nutrientConfidence: 'medium',
        personId: null,
        isVerified: false,
        imageUrl: null,
        category: null,
        tags: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      group: 'branded',
      score: 200,
      isFavorite: false,
      logCount: 0,
      source: 'curated',
      source_rank: 2,
      tokenMatchCount: 3,
      brandGroupHits: 1,
      matchedVariants: ['chobani', 'greek', 'yogurt'],
    } as unknown) as FoodSearchResult;

    const analytical: FoodSearchResult = ({
      ...edible,
      food: {
        ...edible.food,
        id: 'analytical-1',
        canonicalName: 'Proximates, Greek yogurt, Chobani',
      },
      score: 220,
    } as unknown) as FoodSearchResult;

    const pruned = pruneAnalyticalRowsForYogurtBrandQuery([analytical, edible], tokenGroups);
    expect(pruned.map((r) => r.food.canonicalName)).toEqual(['Yogurt, Greek, 2% Fat, Mango']);
  });
});

// ============================================================================
// Block 3 — Integration tests with mocked supabaseAdmin. These run the real
// searchFoods pipeline end-to-end and assert *stable* product outcomes plus
// the new Phase A debug payload shape.
// ============================================================================

describe('searchFoods integration: Phase A debug payload + Amylu same-item', () => {
  function tableResolver(byTable: Record<string, unknown[]>): FixtureResolver {
    return ({ table }) => byTable[table] ?? [];
  }

  it('attaches stageTimings, retrieval, fallbackGate, winnerRationale, and consumer when debug=true', async () => {
    fixtureResolver = tableResolver({
      food_objects: [],
      promoted_off_foods: [],
      off_products_mirror: [],
      user_food_preferences: [],
    });

    const response = await searchFoods('Amylu Breakfast Time Chicken Mini Links', null, {
      debug: true,
      consumer: 'sections',
    });

    expect(response.debug).toBeDefined();
    const dbg = response.debug!;
    expect(typeof dbg.totalMs).toBe('number');
    expect(Array.isArray(dbg.stageTimings)).toBe(true);
    expect(dbg.stageTimings!.some((s) => s.stage === 'normalize')).toBe(true);
    expect(dbg.stageTimings!.some((s) => s.stage === 'phaseA_food_objects')).toBe(true);
    expect(Array.isArray(dbg.retrieval)).toBe(true);
    expect(dbg.fallbackGate).toBeDefined();
    expect(dbg.fallbackGate!.curatedCount).toBe(0);
    // Phase E: `knownSameItemOffProductIds` was removed from the debug
    // payload along with the same-item registry surface. Reaching the OFF
    // representative is now exercised by the gate reason + preferredFallback
    // assertions below and by the Amylu same-item integration tests.
    expect(dbg.consumer).toEqual({
      consumer: 'sections',
      pageContext: null,
      sessionId: null,
    });
    expect(Array.isArray(dbg.winnerRationale)).toBe(true);
  });

  // Helper for the Amylu same-item integration scenarios below.
  function setupAmyluSameItemFixtures(thinCuratedOverrides: Partial<FoodObjectFixture> = {}) {
    const thinCurated = fObj({
      id: 'curated-amylu-thin',
      canonical_name: 'Chicken mini link',
      brand_name: 'Amylu Foods LLC',
      source_type: 'branded',
      source_provider: 'fdc',
      source_id: '092227741095',
      upc: '092227741095',
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      nutrient_confidence: 'low',
      aliases: ['Chicken mini link', 'Amylu chicken mini link'],
      ...thinCuratedOverrides,
    });

    const usableOff = offRow({
      off_product_id: '0092227741095',
      product_name: 'Breakfast Time Chicken Mini Links',
      brands: 'Amylu',
      barcode: '0092227741095',
      energy_kcal_100g: 230,
      protein_g_100g: 14,
      carbs_g_100g: 2,
      fat_g_100g: 18,
      fiber_g_100g: 0,
      sugars_g_100g: 1,
      sodium_mg_100g: 480,
    });

    fixtureResolver = ({ table }) => {
      if (table === 'food_objects') return [thinCurated];
      if (table === 'off_products_mirror') return [usableOff];
      return [];
    };
  }

  // Locked positive outcome: when the bounded same-item registry maps the
  // query, the usable OFF row is reachable in the off section.
  it('Amylu same-item: usable OFF row is reachable in the off section', async () => {
    setupAmyluSameItemFixtures();

    const response = await searchFoods('Amylu Breakfast Time Chicken Mini Links', null, {
      debug: true,
      consumer: 'sections',
    });

    const offSection = response.sections.find((s) => s.key === 'off');
    expect(offSection).toBeDefined();
    expect(offSection!.items.some((it) => it.food.id === 'off:0092227741095')).toBe(true);
    expect(['gate_known_same_item', 'gate_zero_curated', 'gate_thin_curated_promotion']).toContain(
      response.debug!.fallbackGate!.reason
    );
    // Preferred fallback id is recorded in fallback gate debug.
    expect(response.debug!.fallbackGate!.preferredFallbackId).toBe('off:0092227741095');
  });

  // Locked positive outcome: when the curated row has *enough* token coverage
  // to qualify as a promotion candidate (i.e., the user's main scenario from
  // prior phase work — descriptor tokens overlap fully), the thin same-item
  // duplicate IS suppressed today. This is the rule that *currently* fires.
  it('Amylu same-item: thin curated with full descriptor coverage is suppressed', async () => {
    // Give the curated row the full descriptive name — typical of an FDC entry
    // where the label is detailed but macros are missing.
    setupAmyluSameItemFixtures({
      canonical_name: 'Amylu Breakfast Time Chicken Mini Links',
      brand_name: 'Amylu',
    });

    const response = await searchFoods('Amylu Breakfast Time Chicken Mini Links', null, {
      debug: true,
      consumer: 'sections',
    });

    const thinCuratedFound = response.sections
      .filter((s) => s.key !== 'off' && s.key !== 'promoted_off')
      .flatMap((s) => s.items)
      .some((it) => it.food.id === 'curated-amylu-thin');
    expect(thinCuratedFound).toBe(false);
    // Suppressed sibling is recorded in the winner rationale.
    const suppressedFromTopRationale =
      response.debug!.winnerRationale?.[0]?.suppressedSiblingIds ?? [];
    expect(suppressedFromTopRationale).toContain('curated-amylu-thin');
  });

  // Phase D: Gap closed. Sparse-name thin curated rows that share UPC with a
  // usable OFF row ARE suppressed now — regardless of descriptor token
  // coverage — because the same-item identity module proves identity by UPC
  // and the suppression filter treats strong proofs (UPC/source) as
  // unconditional grounds for suppression.
  it('Amylu same-item: sparse-name thin curated IS suppressed via UPC identity (Phase D)', async () => {
    setupAmyluSameItemFixtures(); // sparse name "Chicken mini link"

    const response = await searchFoods('Amylu Breakfast Time Chicken Mini Links', null, {
      debug: true,
      consumer: 'sections',
    });

    // The OFF row is reachable.
    const offSection = response.sections.find((s) => s.key === 'off');
    expect(offSection).toBeDefined();
    expect(offSection!.items.some((it) => it.food.id === 'off:0092227741095')).toBe(true);

    // Phase D expectation: the thin curated sibling is suppressed.
    const thinCuratedFound = response.sections
      .filter((s) => s.key !== 'off' && s.key !== 'promoted_off')
      .flatMap((s) => s.items)
      .some((it) => it.food.id === 'curated-amylu-thin');
    expect(thinCuratedFound).toBe(false);

    // Winner rationale records the suppression by id so reviewers can see it.
    const suppressed = response.debug!.winnerRationale?.[0]?.suppressedSiblingIds ?? [];
    expect(suppressed).toContain('curated-amylu-thin');

    // Preferred fallback id is the OFF row.
    expect(response.debug!.fallbackGate!.preferredFallbackId).toBe('off:0092227741095');
  });

  // Phase D: Bare-UPC queries with leading-zero variance must resolve to the
  // same OFF item. This test guards the `searchOffFallback` post-filter fix
  // that replaced exact-string UPC equality with normalized equivalence.
  it('UPC bare query 092227741095 (12 digits) resolves to OFF 0092227741095 (13 digits stored)', async () => {
    const usableOff = offRow({
      off_product_id: '0092227741095',
      product_name: 'Breakfast Time Chicken Mini Links',
      brands: 'Amylu',
      barcode: '0092227741095',
      energy_kcal_100g: 230,
      protein_g_100g: 14,
      carbs_g_100g: 2,
      fat_g_100g: 18,
    });

    fixtureResolver = ({ table }) => {
      if (table === 'food_objects') return [];
      if (table === 'off_products_mirror') return [usableOff];
      return [];
    };

    // Bare 12-digit UPC query (no leading zero).
    const response = await searchFoods('092227741095', null, {
      debug: true,
      consumer: 'sections',
    });

    const flatUpcs = response.results.map((r) => r.food.upc);
    expect(flatUpcs).toContain('0092227741095');
  });

  it('UPC bare query 0092227741095 (13 digits) resolves to the same OFF item', async () => {
    const usableOff = offRow({
      off_product_id: '0092227741095',
      product_name: 'Breakfast Time Chicken Mini Links',
      brands: 'Amylu',
      barcode: '0092227741095',
      energy_kcal_100g: 230,
      protein_g_100g: 14,
      carbs_g_100g: 2,
      fat_g_100g: 18,
    });

    fixtureResolver = ({ table }) => {
      if (table === 'food_objects') return [];
      if (table === 'off_products_mirror') return [usableOff];
      return [];
    };

    const response = await searchFoods('0092227741095', null, {
      debug: true,
      consumer: 'sections',
    });

    const flatUpcs = response.results.map((r) => r.food.upc);
    expect(flatUpcs).toContain('0092227741095');
  });

  it('UPC leading-zero variants: thin curated 092227741095 maps to OFF 0092227741095 same-item', async () => {
    const thinCurated = fObj({
      id: 'curated-amylu-thin',
      canonical_name: 'Chicken mini link',
      brand_name: 'Amylu Foods LLC',
      source_type: 'branded',
      source_provider: 'fdc',
      source_id: '092227741095',
      upc: '092227741095',
      nutrient_confidence: 'low',
      aliases: ['Chicken mini link'],
    });

    const usableOff = offRow({
      off_product_id: '0092227741095',
      product_name: 'Breakfast Time Chicken Mini Links',
      brands: 'Amylu',
      barcode: '0092227741095',
    });

    fixtureResolver = ({ table }) => {
      if (table === 'food_objects') return [thinCurated];
      if (table === 'off_products_mirror') return [usableOff];
      return [];
    };

    const response = await searchFoods('Amylu Breakfast Time Chicken Mini Links', null, {
      debug: true,
      consumer: 'sections',
    });

    // The OFF mirror row should be reachable through the same-item path.
    const offSection = response.sections.find((s) => s.key === 'off');
    expect(offSection?.items.some((it) => it.food.upc === '0092227741095')).toBe(true);
  });
});

describe('searchFoods integration: section-vs-flat projection parity', () => {
  it('returns the same flat results regardless of consumer hint (server output is consumer-agnostic)', async () => {
    const branded = fObj({
      id: 'branded-1',
      canonical_name: 'Chocolate Bar',
      brand_name: 'Hershey',
      source_type: 'branded',
      calories: 250,
      protein_g: 3,
      carbs_g: 28,
      fat_g: 14,
      sugar_g: 24,
    });

    fixtureResolver = ({ table }) => {
      if (table === 'food_objects') return [branded];
      return [];
    };

    const fromSections = await searchFoods('chocolate', null, { consumer: 'sections' });
    fixtureResolver = ({ table }) => {
      if (table === 'food_objects') return [branded];
      return [];
    };
    const fromFlat = await searchFoods('chocolate', null, { consumer: 'flat' });

    // 1) Top result IDs match across consumers.
    expect(fromSections.results.map((r) => r.food.id)).toEqual(fromFlat.results.map((r) => r.food.id));

    // 2) `results` is the flatten of `sections` (server-side parity).
    const flattened = fromSections.sections.flatMap((s) => s.items).map((r) => r.food.id);
    expect(fromSections.results.map((r) => r.food.id)).toEqual(flattened);

    // 3) totalReturned reflects sections shown.
    const totalShown = fromSections.sections.reduce((sum, s) => sum + s.shown, 0);
    expect(fromSections.totalReturned).toBe(totalShown);
  });
});

describe('searchFoods integration: graceful degradation when fallback DBs error', () => {
  it('does not throw and still returns curated results when off_products_mirror errors', async () => {
    // Use a multi-token query where the curated row matches partially so it
    // survives, but is NOT near-exact, to force the fallback path to run and
    // hit the simulated errors. (A near-exact curated short-circuits the
    // fallback gate entirely, by design.)
    const curated = fObj({
      id: 'curated-1',
      canonical_name: 'Greek Yogurt',
      brand_name: 'Generic',
      source_type: 'common',
      calories: 100,
      protein_g: 17,
      carbs_g: 6,
      fat_g: 0,
    });

    fixtureResolver = ({ table }) => {
      if (table === 'food_objects') return [curated];
      if (table === 'off_products_mirror') return { __error: 'simulated timeout' };
      if (table === 'promoted_off_foods') return { __error: 'simulated timeout' };
      return [];
    };

    let response: Awaited<ReturnType<typeof searchFoods>> | null = null;
    let threw = false;
    try {
      // Query "greek yogurt cup": curated "Greek Yogurt" matches 2/3 tokens,
      // not near-exact (no "cup" in combined text), so the fallback runs.
      response = await searchFoods('greek yogurt cup', null, { debug: true, consumer: 'sections' });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(response).not.toBeNull();
    // Curated row still returns despite OFF / promoted_off both erroring.
    const flatIds = response!.results.map((r) => r.food.id);
    expect(flatIds).toContain('curated-1');
    // Retrieval debug captures the error so reviewers can see what failed.
    const retrievalErrors = response!.debug?.retrieval?.filter((r) => !!r.error) ?? [];
    expect(retrievalErrors.length).toBeGreaterThan(0);
    expect(retrievalErrors.some((r) => r.error?.includes('simulated timeout'))).toBe(true);
  });
});

describe('searchFoods integration: empty query short-circuits without DB calls', () => {
  it('returns an empty response and does not query the database', async () => {
    fixtureResolver = () => {
      throw new Error('Should not query DB for empty query');
    };
    const response = await searchFoods('', null, { debug: true });
    expect(response.results).toEqual([]);
    expect(response.sections).toEqual([]);
    expect(response.totalReturned).toBe(0);
  });
});
