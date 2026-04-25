/**
 * Food Server Service — Phase 3 Foundation
 * 
 * Handles food search, UPC lookup, and provisional record creation.
 * Server-side only (uses supabaseAdmin).
 * 
 * Principles:
 * - All items resolve to ONE canonical FoodObject model
 * - Source tiering affects ranking/confidence, not logging ability
 * - Search results grouped: A (Your Foods), B (Branded), C (Common)
 * - Provisional records allow immediate logging, queue async enrichment
 */

import { supabaseAdmin } from '../supabaseServerClient';
import { hasNearExactCuratedMatch, normalizeForNearExact, normalizeOffRow } from './offNormalization';
// Phase C-lite — canonical types are defined in lib/food/types.ts. The server
// imports them here AND re-exports them below so existing
// `from '@/lib/food/foodServerService'` imports keep working unchanged. There
// is no longer a duplicate set of declarations in this file.
import type {
  FoodMeasure,
  FoodNutrients,
  FoodObject,
  FoodResultSource,
  FoodSearchConsumerEcho,
  FoodSearchDebugBreakdown,
  FoodSearchDebugInfo,
  FoodSearchFallbackDebug,
  FoodSearchFallbackGateReason,
  FoodSearchFallbackState,
  FoodSearchNutritionQualityTier,
  FoodSearchRankingSignals,
  FoodSearchReadiness,
  FoodSearchReadinessBasis,
  FoodSearchResponse,
  FoodSearchResult,
  FoodSearchRetrievalDebug,
  FoodSearchStageTiming,
  FoodSearchWinnerRationale,
  FoodSourceType,
  CreateCustomFoodInput,
  NutrientConfidence,
  NutrientProvenance,
  OffServingNormalization,
  SearchGroup,
  SearchResultSection,
  SectionKey,
} from './types';
export type {
  FoodMeasure,
  FoodNutrients,
  FoodObject,
  FoodResultSource,
  FoodSearchConsumerEcho,
  FoodSearchDebugBreakdown,
  FoodSearchDebugInfo,
  FoodSearchFallbackDebug,
  FoodSearchFallbackGateReason,
  FoodSearchFallbackState,
  FoodSearchNutritionQualityTier,
  FoodSearchRankingSignals,
  FoodSearchReadiness,
  FoodSearchReadinessBasis,
  FoodSearchResponse,
  FoodSearchResult,
  FoodSearchRetrievalDebug,
  FoodSearchStageTiming,
  FoodSearchWinnerRationale,
  FoodSourceType,
  CreateCustomFoodInput,
  NutrientConfidence,
  NutrientProvenance,
  OffServingNormalization,
  SearchGroup,
  SearchResultSection,
  SectionKey,
};
import { recordMissingItemRequest } from '@/lib/missingItems/missingItemRequestServerService';
import {
  normalizeSearchQuery,
  normalizeForDedupe,
  countTokenGroupMatches,
  buildAndGroupedFilter,
  buildBrandGatedFallbackFilter,
  matchesBrandGroup,
  logSearchDebug,
  logSearchDebugForced,
  escapeForLike,
  type TokenGroup,
} from './searchNormalization';
import {
  areSameItem,
  getUpcVariants,
  hasStrongIdentitySignal,
  isQueryUpcMatchForResult,
  isStrongProof,
  proveSameItem,
} from './sameItem';
import {
  SearchInstrumentation,
  buildGroupKeyForRationale,
  digestFilter,
  withRetrievalTiming,
} from './searchInstrumentation';
import {
  getCachedBrandTokens,
  loadBrandEvidence,
  getBrandEvidenceCacheSummary,
} from './brandEvidenceCache';

// ============================================================================
// Internal-only helper input types (server-side; not part of the public API)
// ============================================================================

/**
 * Internal input shape for `buildRankingSignals`. Server-only — the canonical
 * `FoodSearchRankingSignals` (the *output*) lives in `lib/food/types.ts`.
 */
interface FoodSearchSemanticsInput {
  trustRank: number;
  fallbackState: FoodSearchFallbackState;
  nutritionConfidence: NutrientConfidence;
  scoreReadiness: FoodSearchReadiness;
  readinessBasis: FoodSearchReadinessBasis;
  nutritionCompletenessScore: number | null;
  hasMacros: boolean;
  nutritionBasis?: 'per_100g' | 'per_serving' | 'unknown';
  servingConfidence?: 'high' | 'medium' | 'low';
}

/**
 * Section configuration for display order and labels.
 */
const SECTION_CONFIG: Record<SectionKey, { label: string; order: number }> = {
  my_foods:     { label: 'My Foods',                order: 1 },
  common:       { label: 'Common Foods',            order: 2 },
  branded:      { label: 'Branded',                 order: 3 },
  scanned:      { label: 'Scanned',                 order: 4 },
  other:        { label: 'Other',                   order: 5 },
  promoted_off: { label: 'Reviewed Community Data', order: 6 },
  off:          { label: 'Open Food Facts',         order: 7 },
};

const DEFAULT_SECTION_LIMIT = 12;
const DEFAULT_TOTAL_LIMIT = 50;

// Phase A observability helpers (`SearchInstrumentation`, `digestFilter`,
// `withRetrievalTiming`, `buildGroupKeyForRationale`) live in
// `lib/food/searchInstrumentation.ts`. They are imported at the top of this
// file. The canonical `FoodSearchResponse` (with `debug: FoodSearchDebugInfo`)
// lives in `lib/food/types.ts`. The previous duplicate response shape that
// was inlined here has been removed in Phase C-lite — the response object
// produced by `searchFoods` already has the same shape as the canonical type.

interface FoodObjectRow {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  source_type: string;
  source_provider: string | null;
  source_id: string | null;
  source_dataset: string | null;  // USDA dataset: 'branded' | 'foundation' | 'sr_legacy' | 'survey' | 'fndds' | null
  upc: string | null;
  serving_size_g: number;
  serving_unit: string;
  serving_description: string | null;
  household_serving_text: string | null;
  measures: Array<{ unit: string; grams: number; label?: string }> | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  potassium_mg?: number | null;
  magnesium_mg?: number | null;
  iron_mg?: number | null;
  calcium_mg?: number | null;
  zinc_mg?: number | null;
  folate_ug?: number | null;
  vitamin_a_ug_rae?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_ug?: number | null;
  vitamin_b12_ug?: number | null;
  nutrients_extended: Record<string, number>;
  nutrient_provenance: string;
  nutrient_confidence: string;
  person_id: string | null;
  is_verified: boolean;
  image_url: string | null;
  category: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Helpers
// ============================================================================

function numOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function mapRowToNutrients(row: FoodObjectRow): {
  potassiumMg: number | null;
  magnesiumMg: number | null;
  ironMg: number | null;
  calciumMg: number | null;
  zincMg: number | null;
  folateUg: number | null;
  vitaminAUgRae: number | null;
  vitaminCmg: number | null;
  vitaminDug: number | null;
  vitaminB12Ug: number | null;
} {
  return {
    potassiumMg: numOrNull(row.potassium_mg),
    magnesiumMg: numOrNull(row.magnesium_mg),
    ironMg: numOrNull(row.iron_mg),
    calciumMg: numOrNull(row.calcium_mg),
    zincMg: numOrNull(row.zinc_mg),
    folateUg: numOrNull(row.folate_ug),
    vitaminAUgRae: numOrNull(row.vitamin_a_ug_rae),
    vitaminCmg: numOrNull(row.vitamin_c_mg),
    vitaminDug: numOrNull(row.vitamin_d_ug),
    vitaminB12Ug: numOrNull(row.vitamin_b12_ug),
  };
}

function rowToFoodObject(row: FoodObjectRow): FoodObject {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    brandName: row.brand_name,
    aliases: row.aliases || [],
    sourceType: row.source_type as FoodSourceType,
    sourceProvider: row.source_provider,
    sourceId: row.source_id,
    sourceDataset: row.source_dataset,
    upc: row.upc,
    servingSizeG: Number(row.serving_size_g),
    servingUnit: row.serving_unit,
    servingDescription: row.serving_description,
    householdServingText: row.household_serving_text,
    measures: row.measures ?? null,
    calories: row.calories !== null ? Number(row.calories) : null,
    proteinG: row.protein_g !== null ? Number(row.protein_g) : null,
    carbsG: row.carbs_g !== null ? Number(row.carbs_g) : null,
    fatG: row.fat_g !== null ? Number(row.fat_g) : null,
    fiberG: row.fiber_g !== null ? Number(row.fiber_g) : null,
    sugarG: row.sugar_g !== null ? Number(row.sugar_g) : null,
    sodiumMg: row.sodium_mg !== null ? Number(row.sodium_mg) : null,
    nutrients: mapRowToNutrients(row),
    nutrientsExtended: row.nutrients_extended || {},
    nutrientProvenance: row.nutrient_provenance as NutrientProvenance,
    nutrientConfidence: row.nutrient_confidence as NutrientConfidence,
    personId: row.person_id,
    isVerified: row.is_verified,
    imageUrl: row.image_url,
    category: row.category,
    tags: row.tags || [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function determineSearchGroup(food: FoodObject, personId: string | null, isFavorite: boolean, logCount: number): SearchGroup {
  // Group A: Your Foods (user-created, favorites, or frequently logged)
  // Note: Only check personId match if both are truthy (to avoid null === null matching)
  if ((personId && food.personId === personId) || isFavorite || logCount > 0) {
    return 'your_foods';
  }
  // Group B: Branded
  if (food.sourceType === 'branded' || food.upc) {
    return 'branded';
  }
  // Group C: Common / Canonical
  return 'common';
}

/**
 * Determine the section key for a food object.
 * Section order: my_foods → common → branded → scanned → other
 * 
 * Rules:
 * 1) User-interacted (logged, favorited, personId match) → 'my_foods'
 * 2) Fine Diet verified foods → 'common' (high visibility alongside USDA common)
 * 3) Non-USDA:
 *    - source_type='user' → 'my_foods'
 *    - source_type='provisional' → 'scanned'
 *    - other → 'other'
 * 4) USDA (source_provider='usda'):
 *    - source_dataset in {'foundation','sr_legacy','survey','fndds'} OR source_type='common' → 'common'
 *    - source_dataset='branded' OR source_type='branded' → 'branded'
 * 
 * Note: isFavorite and logCount bump user-interacted items into 'my_foods'
 */
function determineSectionKey(
  food: FoodObject, 
  personId: string | null, 
  isFavorite: boolean, 
  logCount: number
): SectionKey {
  // User-interacted items go to "My Foods"
  // Note: Only check personId match if both are truthy (to avoid null === null matching)
  if ((personId && food.personId === personId) || isFavorite || logCount > 0) {
    return 'my_foods';
  }

  // Fine Diet verified foods appear in Common Foods section
  // This gives them high visibility alongside USDA common foods
  if (food.sourceProvider === 'fine_diet' && food.isVerified) {
    return 'common';
  }

  // Non-USDA foods
  if (food.sourceProvider !== 'usda') {
    if (food.sourceType === 'user') {
      return 'my_foods';
    }
    if (food.sourceType === 'provisional') {
      return 'scanned';
    }
    // Unverified fine_diet foods and other non-USDA go to 'other'
    return 'other';
  }

  // USDA foods - use source_dataset when available
  const dataset = food.sourceDataset;
  
  // Common datasets: foundation, sr_legacy, survey, fndds (prepared/restaurant-like)
  if (dataset === 'foundation' || dataset === 'sr_legacy' || dataset === 'survey' || dataset === 'fndds') {
    return 'common';
  }
  
  // Branded dataset
  if (dataset === 'branded') {
    return 'branded';
  }

  // Fallback: use source_type when source_dataset is not set
  if (food.sourceType === 'common') {
    return 'common';
  }
  if (food.sourceType === 'branded') {
    return 'branded';
  }

  // Catch-all
  return 'other';
}

/**
 * Get numeric priority for source_type (higher = better)
 */
function getSourceTypePriority(sourceType: FoodSourceType): number {
  switch (sourceType) {
    case 'branded': return 4;
    case 'common': return 3;
    case 'user': return 2;
    case 'provisional': return 1;
    default: return 0;
  }
}

/**
 * Get numeric priority for nutrient_confidence (higher = better)
 */
function getConfidencePriority(confidence: NutrientConfidence): number {
  switch (confidence) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

/**
 * Check if food has macros (protein, carbs, fat are not all null)
 */
function hasMacros(food: FoodObject): boolean {
  return food.proteinG !== null || food.carbsG !== null || food.fatG !== null;
}

function countMicronutrients(food: FoodObject): number {
  if (!food.nutrients) return 0;
  const values = [
    food.nutrients.potassiumMg,
    food.nutrients.magnesiumMg,
    food.nutrients.ironMg,
    food.nutrients.calciumMg,
    food.nutrients.zincMg,
    food.nutrients.folateUg,
    food.nutrients.vitaminAUgRae,
    food.nutrients.vitaminCmg,
    food.nutrients.vitaminDug,
    food.nutrients.vitaminB12Ug,
    food.sodiumMg,
  ];
  return values.filter((value) => value !== null && value !== undefined).length;
}

function scoreReadinessFromMicronutrients(food: FoodObject): FoodSearchReadiness {
  const count = countMicronutrients(food);
  if (count >= 8) return 'high';
  if (count >= 4) return 'medium';
  return 'low';
}

export function determineNutritionQualityTier(args: {
  confidence: NutrientConfidence;
  readiness: FoodSearchReadiness;
  hasMacros: boolean;
  completenessScore: number | null;
}): FoodSearchNutritionQualityTier {
  const { confidence, readiness, hasMacros: macrosPresent, completenessScore } = args;
  if (confidence === 'high' && readiness !== 'low') return 'strong';
  if (macrosPresent && (confidence !== 'low' || (completenessScore ?? 0) >= 3)) return 'usable';
  return 'thin';
}

export function buildRankingSignals(input: FoodSearchSemanticsInput): FoodSearchRankingSignals {
  const nutritionQualityTier = determineNutritionQualityTier({
    confidence: input.nutritionConfidence,
    readiness: input.scoreReadiness,
    hasMacros: input.hasMacros,
    completenessScore: input.nutritionCompletenessScore,
  });

  return {
    trustRank: input.trustRank,
    fallbackState: input.fallbackState,
    nutritionConfidence: input.nutritionConfidence,
    scoreReadiness: input.scoreReadiness,
    readinessBasis: input.readinessBasis,
    nutritionCompletenessScore: input.nutritionCompletenessScore,
    nutritionQualityTier,
    nutritionallyUsable: nutritionQualityTier !== 'thin',
    nutritionBasis: input.nutritionBasis,
    servingConfidence: input.servingConfidence,
  };
}

function getNutritionQualityBonus(signals: FoodSearchRankingSignals): number {
  switch (signals.nutritionQualityTier) {
    case 'strong':
      return 24;
    case 'usable':
      return 10;
    case 'thin':
      return -18;
    default:
      return 0;
  }
}

function getThinResultPenalty(signals: FoodSearchRankingSignals): number {
  return signals.nutritionQualityTier === 'thin' ? 30 : 0;
}

function isAnalyticalCommonName(name: string): boolean {
  return /^(proximates|vitamins),\s*/i.test(name);
}

// UPC normalization is owned by `lib/food/sameItem` (Phase D). All call sites
// in this file use `normalizeUpc` and `getUpcVariants` directly — there is no
// longer a local alias.

function isNearExactResultForQuery(rawQuery: string, result: FoodSearchResult): boolean {
  const normQuery = normalizeForNearExact(rawQuery);
  const queryTokens = normQuery.split(' ').filter(Boolean);
  if (queryTokens.length === 0) return false;

  const normName = normalizeForNearExact(result.food.canonicalName);
  const normBrand = result.food.brandName ? normalizeForNearExact(result.food.brandName) : '';
  const combined = normBrand ? `${normName} ${normBrand}` : normName;
  const primaryToken = queryTokens[0];

  if (normName === normQuery) return true;
  if (normName.startsWith(normQuery)) return true;
  if (queryTokens.length >= 2 && queryTokens.every((t) => combined.includes(t))) return true;
  if (queryTokens.length === 1 && normName.split(' ').includes(primaryToken)) return true;
  return false;
}

/**
 * Phase D: thin wrapper over `proveSameItem` from `lib/food/sameItem`.
 * Kept for legacy callers (and the existing exported test surface). Use
 * `proveSameItem` directly when you need to know which proof fired.
 */
export function isSameFoodAcrossLayers(a: FoodSearchResult, b: FoodSearchResult): boolean {
  return areSameItem(a, b);
}

function isFallbackPromotionCandidate(
  result: FoodSearchResult,
  rawQuery: string,
  tokenGroups: TokenGroup[],
  hasBrandTokens: boolean
): boolean {
  if (result.source !== 'curated') return false;
  if (result.rankingSignals?.nutritionQualityTier !== 'thin') return false;
  if (isNearExactResultForQuery(rawQuery, result)) return true;

  const tokenMatchCount = result.tokenMatchCount || 0;
  const brandGroupHits = result.brandGroupHits || 0;
  const minimumRelevantTokens = Math.max(2, tokenGroups.length - 2);
  if (tokenMatchCount < Math.min(tokenGroups.length, minimumRelevantTokens)) return false;
  if (hasBrandTokens && brandGroupHits === 0) return false;
  return true;
}

export function findPreferredUsableFallbackMatch(
  rawQuery: string,
  curatedPromotionCandidates: FoodSearchResult[],
  fallbackResults: FoodSearchResult[]
): FoodSearchResult | null {
  return (
    fallbackResults.find(
      (result) =>
        result.rankingSignals?.nutritionallyUsable &&
        (
          isNearExactResultForQuery(rawQuery, result) ||
          curatedPromotionCandidates.some((candidate) => isSameFoodAcrossLayers(candidate, result))
        )
    ) ?? null
  );
}

export function compareFallbackRanking(a: FoodSearchResult, b: FoodSearchResult): number {
  const aSignals = a.rankingSignals;
  const bSignals = b.rankingSignals;

  if (b.score !== a.score) return b.score - a.score;

  const aUsable = aSignals?.nutritionallyUsable ? 1 : 0;
  const bUsable = bSignals?.nutritionallyUsable ? 1 : 0;
  if (bUsable !== aUsable) return bUsable - aUsable;

  const aQuality = aSignals?.nutritionQualityTier === 'strong' ? 2 : aSignals?.nutritionQualityTier === 'usable' ? 1 : 0;
  const bQuality = bSignals?.nutritionQualityTier === 'strong' ? 2 : bSignals?.nutritionQualityTier === 'usable' ? 1 : 0;
  if (bQuality !== aQuality) return bQuality - aQuality;

  const aCompleteness = aSignals?.nutritionCompletenessScore ?? -1;
  const bCompleteness = bSignals?.nutritionCompletenessScore ?? -1;
  if (bCompleteness !== aCompleteness) return bCompleteness - aCompleteness;

  const aConfidence = aSignals ? getConfidencePriority(aSignals.nutritionConfidence) : 0;
  const bConfidence = bSignals ? getConfidencePriority(bSignals.nutritionConfidence) : 0;
  if (bConfidence !== aConfidence) return bConfidence - aConfidence;

  const aTokenCount = a.tokenMatchCount || 0;
  const bTokenCount = b.tokenMatchCount || 0;
  if (bTokenCount !== aTokenCount) return bTokenCount - aTokenCount;

  const aBrandHits = a.brandGroupHits || 0;
  const bBrandHits = b.brandGroupHits || 0;
  if (bBrandHits !== aBrandHits) return bBrandHits - aBrandHits;

  const aName = a.food.canonicalName.length;
  const bName = b.food.canonicalName.length;
  if (aName !== bName) return aName - bName;

  const nameCompare = a.food.canonicalName.localeCompare(b.food.canonicalName);
  if (nameCompare !== 0) return nameCompare;

  return a.food.id.localeCompare(b.food.id);
}

export function narrowResultsForSpecificQuery(
  results: FoodSearchResult[],
  tokenGroups: TokenGroup[],
  hasBrandTokens: boolean
): FoodSearchResult[] {
  if (results.length === 0 || tokenGroups.length <= 1) return results;

  const maxTokens = results.reduce((max, result) => Math.max(max, result.tokenMatchCount || 0), 0);
  if (maxTokens <= 1) return results;

  const fullMatches = results.filter((result) => (result.tokenMatchCount || 0) === tokenGroups.length);
  if (fullMatches.length > 0) return fullMatches;

  const strongestTokenMatches = results.filter((result) => (result.tokenMatchCount || 0) === maxTokens);
  if (hasBrandTokens) {
    const maxBrandHits = strongestTokenMatches.reduce(
      (max, result) => Math.max(max, result.brandGroupHits || 0),
      0
    );
    if (maxBrandHits > 0) {
      const strongestBrandMatches = strongestTokenMatches.filter(
        (result) => (result.brandGroupHits || 0) === maxBrandHits
      );
      if (strongestBrandMatches.length > 0) return strongestBrandMatches;
    }
  }

  const minTokens = Math.max(1, maxTokens - 1);
  return results.filter((result) => (result.tokenMatchCount || 0) >= minTokens);
}

export function pruneFallbackPackForSpecificQuery(
  results: FoodSearchResult[],
  tokenGroups: TokenGroup[],
  originalRaw: string
): FoodSearchResult[] {
  if (results.length === 0 || tokenGroups.length <= 1) return results;

  const hasBrandTokens = tokenGroups.some((group) => group.isBrandLike);
  if (!hasBrandTokens) return results;

  const brandMatched = results.filter((result) => (result.brandGroupHits || 0) > 0);
  if (brandMatched.length === 0) return results;

  const nearExactBrandMatched = brandMatched.filter((result) =>
    isNearExactResultForQuery(originalRaw, result)
  );
  if (nearExactBrandMatched.length > 0) return nearExactBrandMatched;

  return brandMatched;
}

function shouldSuppressAnalyticalYogurtRows(tokenGroups: TokenGroup[]): boolean {
  const hasBrandTokens = tokenGroups.some((group) => group.isBrandLike);
  if (!hasBrandTokens) return false;

  const queryTokens = new Set(tokenGroups.map((group) => group.canonical));
  return queryTokens.has('yogurt') || queryTokens.has('yoghurt');
}

export function pruneAnalyticalRowsForYogurtBrandQuery(
  results: FoodSearchResult[],
  tokenGroups: TokenGroup[]
): FoodSearchResult[] {
  if (!shouldSuppressAnalyticalYogurtRows(tokenGroups)) return results;

  const nonAnalyticalBrandMatches = results.filter(
    (result) =>
      !isAnalyticalCommonName(result.food.canonicalName) &&
      (result.brandGroupHits || 0) > 0
  );

  if (nonAnalyticalBrandMatches.length === 0) return results;

  return results.filter((result) => !isAnalyticalCommonName(result.food.canonicalName));
}

// Default text columns for OFF MIRROR queries. The mirror has product_name,
// generic_name, and brands. The promoted_off_foods snapshot table does NOT
// have a generic_name column, so callers targeting promoted_off must pass
// PROMOTED_OFF_TEXT_COLUMNS instead. Using the wrong list here causes
// PostgREST to return "column ... does not exist" on every search and
// silently empties the corresponding retrieval stage.
const OFF_MIRROR_TEXT_COLUMNS = ['product_name', 'generic_name', 'brands'] as const;
const PROMOTED_OFF_TEXT_COLUMNS = ['product_name', 'brands'] as const;

function buildMirrorFallbackFilter(
  tokenGroups: TokenGroup[],
  originalRaw: string,
  idColumns: string[],
  textColumns: readonly string[] = OFF_MIRROR_TEXT_COLUMNS
): string {
  const conditions: string[] = [];

  for (const group of tokenGroups) {
    for (const variant of group.dbVariants) {
      const escaped = escapeForLike(variant);
      for (const column of textColumns) {
        conditions.push(`${column}.ilike.%${escaped}%`);
      }
    }
  }

  const comparableUpcs = getUpcVariants(originalRaw);
  if (comparableUpcs.length > 0) {
    for (const column of idColumns) {
      for (const barcode of comparableUpcs) {
        conditions.push(`${column}.eq.${barcode}`);
      }
    }
  }

  return conditions.join(',');
}

function buildMirrorAndGroupedFilter(
  tokenGroups: TokenGroup[],
  textColumns: readonly string[] = OFF_MIRROR_TEXT_COLUMNS
): string {
  if (tokenGroups.length === 0) return '';

  const groups = tokenGroups.map((group) => {
    const conditions = group.dbVariants.flatMap((variant) => {
      const escaped = escapeForLike(variant);
      return textColumns.map((column) => `${column}.ilike.%${escaped}%`);
    });
    return `or(${conditions.join(',')})`;
  });

  if (groups.length === 1) return groups[0];
  return `and(${groups.join(',')})`;
}

function applyFallbackLexicalRanking(
  result: FoodSearchResult,
  tokenGroups: TokenGroup[],
  normalized: string,
  originalRaw: string
): FoodSearchResult {
  const combinedText = `${result.food.canonicalName} ${result.food.brandName || ''}`;
  const { matchCount, brandGroupHits, matchedVariants } = countTokenGroupMatches(combinedText, tokenGroups);
  const combinedLower = combinedText.toLowerCase();
  const comparableQueryUpcs = getUpcVariants(originalRaw);
  const comparableResultUpcs = new Set([
    ...getUpcVariants(result.food.upc),
    ...getUpcVariants(result.food.sourceId),
  ]);
  const barcodeHit =
    comparableQueryUpcs.length > 0 &&
    comparableQueryUpcs.some((candidate) => comparableResultUpcs.has(candidate));

  let score = matchCount * 100;
  if (tokenGroups.length > 1 && matchCount === tokenGroups.length) score += 200;
  if (brandGroupHits > 0) score += brandGroupHits * 40;
  if (normalized && combinedLower.includes(normalized)) score += 140;
  if (barcodeHit) score += 400;
  if (isAnalyticalCommonName(result.food.canonicalName)) score -= 120;

  return {
    ...result,
    score,
    tokenMatchCount: matchCount,
    brandGroupHits,
    matchedVariants,
  };
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Generate a dedupe key for a food object.
 * 
 * Priority:
 * 1. source_provider:source_id (most specific)
 * 2. upc:value (barcode match)
 * 3. name + brand fingerprint (fallback)
 */
function getDedupeKey(row: FoodObjectRow): string {
  // Priority 1: Provider + ID
  if (row.source_provider && row.source_id) {
    return `provider:${row.source_provider}:${row.source_id}`;
  }
  
  // Priority 2: UPC
  if (row.upc) {
    return `upc:${row.upc}`;
  }
  
  // Priority 3: Name + Brand fingerprint
  const normalizedName = normalizeForDedupe(row.canonical_name);
  const normalizedBrand = normalizeForDedupe(row.brand_name || '');
  return `name:${normalizedName}|brand:${normalizedBrand}`;
}

/**
 * Compare two rows to determine which is "better" for deduplication.
 * Returns true if row A is better than row B.
 */
function isBetterDedupeRow(a: FoodObjectRow, b: FoodObjectRow): boolean {
  // 1. Prefer is_verified = true
  if (a.is_verified && !b.is_verified) return true;
  if (!a.is_verified && b.is_verified) return false;
  
  // 2. Prefer higher confidence
  const aConf = getConfidencePriority(a.nutrient_confidence as NutrientConfidence);
  const bConf = getConfidencePriority(b.nutrient_confidence as NutrientConfidence);
  if (aConf > bConf) return true;
  if (aConf < bConf) return false;
  
  // 3. Prefer higher source_type priority (branded > common > user > provisional)
  const aSource = getSourceTypePriority(a.source_type as FoodSourceType);
  const bSource = getSourceTypePriority(b.source_type as FoodSourceType);
  if (aSource > bSource) return true;
  if (aSource < bSource) return false;
  
  // 4. Prefer rows with macros
  const aHasMacros = a.protein_g !== null || a.carbs_g !== null || a.fat_g !== null;
  const bHasMacros = b.protein_g !== null || b.carbs_g !== null || b.fat_g !== null;
  if (aHasMacros && !bHasMacros) return true;
  if (!aHasMacros && bHasMacros) return false;
  
  // 5. Tie-breaker: lexicographic ID (deterministic)
  return a.id < b.id;
}

/**
 * Deduplicate rows by key, keeping the "best" row for each key.
 */
function deduplicateRows(rows: FoodObjectRow[]): { 
  deduped: FoodObjectRow[]; 
  removedCount: number;
} {
  const seen = new Map<string, FoodObjectRow>();
  
  for (const row of rows) {
    const key = getDedupeKey(row);
    const existing = seen.get(key);
    
    if (!existing) {
      seen.set(key, row);
    } else if (isBetterDedupeRow(row, existing)) {
      seen.set(key, row);
    }
    // else: keep existing
  }
  
  const deduped = Array.from(seen.values());
  return {
    deduped,
    removedCount: rows.length - deduped.length,
  };
}

// ============================================================================
// Search
// ============================================================================

/**
 * Search foods by text query.
 * 
 * Results are grouped into:
 * - Group A (Your Foods): user-created, favorites, frequently logged
 * - Group B (Branded): branded items with UPC
 * - Group C (Common): generic/common foods
 * 
 * Search behavior:
 * - Normalizes query with apostrophe-safe token variants (NO apostrophes in DB filters)
 * - Uses AND-grouped matching (must match at least one variant from EACH token group)
 * - Ranks by token group coverage + brand-like token hits
 * - Deduplicates near-identical results
 * - Falls back to brand-gated OR matching if AND returns too few
 */
/**
 * Search options with pagination support
 */
interface SearchFoodsOptions {
  limit?: number;           // Overall max results (default 50)
  sectionLimit?: number;    // Max results per section (default 12)
  section?: SectionKey;     // If set, return only this section (for "Show more")
  sectionOffset?: number;   // Offset for section pagination (default 0)
  debug?: boolean;          // Include debug info in response
  sessionId?: string | null; // Client session ID for search event logging
  pageContext?: string | null; // Page context for search event logging
  /**
   * Phase A — UI consumer hint. Echoed back in debug.consumer and in the
   * structured server log line. Lets us correlate browser-vs-API drift
   * (sections renderer vs flat results renderer) per request.
   */
  consumer?: 'sections' | 'flat' | 'unknown';
}

export async function searchFoods(
  query: string,
  personId: string | null,
  options: SearchFoodsOptions = {}
): Promise<FoodSearchResponse> {
  const { 
    limit = DEFAULT_TOTAL_LIMIT, 
    sectionLimit = DEFAULT_SECTION_LIMIT,
    section: requestedSection,
    sectionOffset = 0,
    debug = process.env.SEARCH_DEBUG === 'true',
    sessionId = null,
    pageContext = null,
    consumer = 'unknown',
  } = options;

  const instr = new SearchInstrumentation();
  instr.consumer = { consumer, pageContext, sessionId };

  const emptyResponse: FoodSearchResponse = { 
    results: [], 
    sections: [],
    totalReturned: 0,
    yourFoods: [], 
    branded: [], 
    common: [], 
    totalCount: 0 
  };
  
  if (!query || query.trim().length < 2) {
    return emptyResponse;
  }

  // === STEP 1: Normalize query with token groups ===
  // Phase E — make sure brand-evidence cache is warm before we classify
  // tokens. When the cache is cold we trigger a load (await on first
  // request after process start; subsequent requests are no-ops thanks to
  // the TTL inside `loadBrandEvidence`). On any failure we fall back to
  // the cold-path heuristic baked into `normalizeSearchQuery` so behavior
  // never abruptly regresses.
  const brandCacheStart = Date.now();
  let brandTokenSet = getCachedBrandTokens();
  if (!brandTokenSet) {
    try {
      const cacheState = await loadBrandEvidence();
      brandTokenSet = cacheState.tokens;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.warn('[searchFoods] brand evidence load failed (cold fallback):', msg);
      brandTokenSet = null;
    }
  }
  instr.recordStage({ stage: 'brand_evidence', ms: Date.now() - brandCacheStart });

  const normalizeStart = Date.now();
  const { normalized, tokens, tokenGroups, originalRaw } = normalizeSearchQuery(query, {
    brandTokenSet,
  });
  instr.recordStage({ stage: 'normalize', ms: Date.now() - normalizeStart });
  
  if (tokens.length === 0) {
    return emptyResponse;
  }
  
  // Count brand-like groups for scoring
  const brandLikeGroups = tokenGroups.filter(g => g.isBrandLike);
  const hasBrandTokens = brandLikeGroups.length > 0;
  
  // Build brand-gated fallback info
  const { filter: brandGatedFilter, requiresBrandHit, brandGroupVariants } = buildBrandGatedFallbackFilter(tokenGroups);
  
  // Debug logger (use forced when debug=true in request)
  const debugLog = debug ? logSearchDebugForced : logSearchDebug;
  
  debugLog('Step 1: Normalization', { 
    rawQuery: originalRaw, 
    normalizedQuery: normalized, 
    tokens,
    tokenGroups: tokenGroups.map(g => ({ 
      canonical: g.canonical, 
      dbVariants: g.dbVariants,
      displayVariants: g.displayVariants,
      isBrandLike: g.isBrandLike 
    })),
    hasBrandTokens,
    brandGroupVariants,
  });
  
  // === STEP 2: Build and execute query ===
  let foodRows: FoodObjectRow[] = [];
  let searchMode: 'and_grouped' | 'brand_gated_fallback' | 'fallback_prefix' = 'and_grouped';
  let phaseAFilter = '';
  let phaseBFilter: string | undefined;
  let phaseACount = 0;
  let phaseBCount: number | undefined;
  
  // Phase A: AND-grouped search (requires match from EACH token group)
  // CRITICAL: Uses dbVariants which have NO apostrophes
  phaseAFilter = buildAndGroupedFilter(tokenGroups);
  
  debugLog('Step 2A: Phase A Query', { 
    mode: 'and_grouped',
    filter: phaseAFilter,
  });
  
  // Execute AND-grouped query with larger fetch size
  const phaseAOutcome = await withRetrievalTiming<FoodObjectRow[]>(
    instr,
    'phaseA_food_objects',
    'food_objects',
    digestFilter(phaseAFilter),
    () =>
      supabaseAdmin
        .from('food_objects')
        .select('*')
        .eq('is_deleted', false)
        .or(phaseAFilter)
        .limit(limit * 10) as unknown as Promise<{
        data: FoodObjectRow[] | null;
        error: { message?: string; code?: string } | null;
      }>
  );
  if (phaseAOutcome.error) {
    console.error('[searchFoods] Phase A error:', phaseAOutcome.error.message);
    debugLog('Step 2A: Phase A ERROR', {
      error: phaseAOutcome.error.message,
      code: phaseAOutcome.error.code,
    });
  } else {
    foodRows = (phaseAOutcome.data || []) as FoodObjectRow[];
  }

  phaseACount = foodRows.length;
  
  debugLog('Step 2A: Phase A Results', { 
    count: phaseACount,
    sampleNames: foodRows.slice(0, 5).map(r => r.canonical_name),
  });
  
  // Phase B: Brand-gated fallback if Phase A returns too few results
  if (foodRows.length < 5 && tokens.length > 0) {
    searchMode = 'brand_gated_fallback';
    phaseBFilter = brandGatedFilter;
    
    debugLog('Step 2B: Phase B Query (brand-gated fallback)', { 
      reason: `Phase A returned only ${foodRows.length} rows`,
      filter: phaseBFilter.slice(0, 500) + (phaseBFilter.length > 500 ? '...' : ''),
      requiresBrandHit,
    });
    
    const phaseBOutcome = await withRetrievalTiming<FoodObjectRow[]>(
      instr,
      'phaseB_brand_gated_or',
      'food_objects',
      digestFilter(phaseBFilter),
      () =>
        supabaseAdmin
          .from('food_objects')
          .select('*')
          .eq('is_deleted', false)
          .or(phaseBFilter!)
          .limit(limit * 6) as unknown as Promise<{
          data: FoodObjectRow[] | null;
          error: { message?: string; code?: string } | null;
        }>
    );
    const orError = phaseBOutcome.error;
    const orResults = phaseBOutcome.data;
    if (!orError && orResults) {
      // Apply brand-gating: if we have brand tokens, filter to items matching brand
      let filteredOrResults = orResults as FoodObjectRow[];
      
      if (requiresBrandHit && brandGroupVariants.length > 0) {
        const beforeFilter = filteredOrResults.length;
        filteredOrResults = filteredOrResults.filter(r => 
          matchesBrandGroup(r.canonical_name, r.brand_name, brandGroupVariants)
        );
        debugLog('Step 2B: Brand-gating applied', {
          beforeFilter,
          afterFilter: filteredOrResults.length,
          brandGroupVariants,
        });
      }
      
      // Merge with any Phase A results, preferring Phase A results
      const andIds = new Set(foodRows.map(r => r.id));
      const additionalRows = filteredOrResults.filter(r => !andIds.has(r.id));
      foodRows = [...foodRows, ...additionalRows];
      phaseBCount = additionalRows.length;
    }
    
    // Phase C: Prefix search as last resort (only if still no results)
    if (foodRows.length === 0) {
      searchMode = 'fallback_prefix';
      const firstVariant = escapeForLike(tokenGroups[0]?.dbVariants[0] || tokens[0]);
      phaseBFilter = `canonical_name.ilike.${firstVariant}%,brand_name.ilike.${firstVariant}%`;
      
      debugLog('Step 2C: Phase C Query (prefix fallback)', { 
        filter: phaseBFilter,
      });
      
      const phaseCOutcome = await withRetrievalTiming<FoodObjectRow[]>(
        instr,
        'phaseC_prefix_fallback',
        'food_objects',
        digestFilter(phaseBFilter),
        () =>
          supabaseAdmin
            .from('food_objects')
            .select('*')
            .eq('is_deleted', false)
            .or(phaseBFilter!)
            .limit(limit * 2) as unknown as Promise<{
            data: FoodObjectRow[] | null;
            error: { message?: string; code?: string } | null;
          }>
      );
      foodRows = (phaseCOutcome.data || []) as FoodObjectRow[];
      phaseBCount = foodRows.length;
    }
  }
  
  debugLog('Step 2: Final DB Results', { 
    totalCount: foodRows.length, 
    searchMode,
    phaseACount,
    phaseBCount,
    sampleNames: foodRows.slice(0, 5).map(r => r.canonical_name),
  });
  
  // === STEP 3: Deduplicate ===
  const dedupeStart = Date.now();
  const { deduped, removedCount } = deduplicateRows(foodRows);
  instr.recordStage({ stage: 'dedupe', ms: Date.now() - dedupeStart, rows: deduped.length });

  debugLog('Step 3: Deduplication', { 
    before: foodRows.length, 
    after: deduped.length, 
    removed: removedCount,
  });

  // === STEP 4: Fetch user preferences ===
  let prefsMap = new Map<string, { isFavorite: boolean; logCount: number }>();
  if (personId && deduped.length > 0) {
    const foodIds = deduped.map((r) => r.id);
    const prefsOutcome = await withRetrievalTiming<
      Array<{ food_object_id: string; is_favorite: boolean; log_count: number }>
    >(
      instr,
      'user_preferences',
      'user_food_preferences',
      `person_id=${personId};ids=${foodIds.length}`,
      () =>
        supabaseAdmin
          .from('user_food_preferences')
          .select('food_object_id, is_favorite, log_count')
          .eq('person_id', personId)
          .in('food_object_id', foodIds) as unknown as Promise<{
          data: Array<{ food_object_id: string; is_favorite: boolean; log_count: number }> | null;
          error: { message?: string; code?: string } | null;
        }>
    );
    const prefs = prefsOutcome.data;
    if (prefs) {
      for (const p of prefs) {
        prefsMap.set(p.food_object_id, { isFavorite: p.is_favorite, logCount: p.log_count });
      }
    }
  }

  // === STEP 5: Score and group results ===
  const scoreStart = Date.now();
  // Group by section key for deterministic ordering
  const sectionBuckets: Record<SectionKey, FoodSearchResult[]> = {
    my_foods:     [],
    common:       [],
    branded:      [],
    scanned:      [],
    other:        [],
    promoted_off: [], // Phase 5: promoted OFF (populated in fallback step, before raw OFF)
    off:          [], // Phase 2: raw OFF fallback (last resort)
  };
  
  // Track best token match for filtering
  let maxTokenMatches = 0;
  let maxBrandHits = 0;
  
  // For debug output
  const debugBreakdowns: FoodSearchDebugBreakdown[] = [];

  for (const row of deduped) {
    const food = rowToFoodObject(row);
    const prefs = prefsMap.get(food.id) || { isFavorite: false, logCount: 0 };
    
    // Determine section key (for new sectioning) AND legacy group (for backward compat)
    const sectionKey = determineSectionKey(food, personId, prefs.isFavorite, prefs.logCount);
    const group = determineSearchGroup(food, personId, prefs.isFavorite, prefs.logCount);
    
    // Calculate token group matches with variant awareness
    const combinedText = `${food.canonicalName} ${food.brandName || ''}`;
    const { matchCount, brandGroupHits, matchedVariants } = countTokenGroupMatches(combinedText, tokenGroups);

    if (matchCount === 0) continue;
    
    // Track max for later filtering
    if (matchCount > maxTokenMatches) {
      maxTokenMatches = matchCount;
    }
    if (brandGroupHits > maxBrandHits) {
      maxBrandHits = brandGroupHits;
    }
    
    // Calculate relevance score
    let score = 0;
    const nameLower = food.canonicalName.toLowerCase();
    const combinedLower = `${food.canonicalName} ${food.brandName || ''}`.toLowerCase();
    
    // === SCORING BREAKDOWN ===
    
    // 1. TOKEN MATCHING (100 points per token group matched)
    const tokenScore = matchCount * 100;
    score += tokenScore;
    
    // 2. ALL-TOKEN BONUS (200 points if all groups matched)
    let allTokenBonus = 0;
    if (tokens.length > 1 && matchCount === tokens.length) {
      allTokenBonus = 200;
      score += allTokenBonus;
    }
    
    // 3. BRAND HIT BONUS (150 points if brand-like token matched)
    // This is critical for "barq's root beer" - items with "barq" should rank higher
    let brandBonus = 0;
    if (hasBrandTokens && brandGroupHits > 0) {
      brandBonus = brandGroupHits * 150;
      score += brandBonus;
    }
    
    // 4. EXACT/PARTIAL MATCH BONUS
    let exactMatchBonus = 0;
    let phraseMatchBonus = 0;
    // Strip USDA suffixes like ", raw", ", cooked" for near-exact matching
    const nameStripped = nameLower.replace(/,\s*(raw|cooked|fresh|frozen|dried|canned|boiled|roasted|grilled|baked|steamed|fried|whole|sliced|chopped|diced|mashed|peeled|unpeeled|with skin|without skin|plain|unsweetened|sweetened|salted|unsalted|organic|ripe|unripe|mature)\b/gi, '').trim();
    if (nameLower === normalized) {
      exactMatchBonus = 50;
    } else if (nameStripped === normalized || nameStripped === tokens[0]) {
      // Near-exact: "bananas, raw" stripped to "bananas" ≈ "banana"
      exactMatchBonus = 45;
    } else if (nameLower.startsWith(tokens[0] || '')) {
      exactMatchBonus = 30;
    } else if (nameLower.includes(normalized)) {
      exactMatchBonus = 20;
    }
    score += exactMatchBonus;

    // 4a. MULTI-TOKEN PHRASE BONUS — exact phrase order should beat
    // shorter but noisier combinations like "Tamale Pie" for "tim tam".
    if (tokens.length > 1 && combinedLower.includes(normalized)) {
      phraseMatchBonus = 140;
      score += phraseMatchBonus;
    }
    
    // 4b. SIMPLICITY BONUS — prefer foods where the query IS the food, not a modifier
    // "banana" should beat "banana bread", "banana smoothie", etc.
    let simplicityBonus = 0;
    const nameWords = nameLower.split(/[\s,]+/).filter(Boolean);
    const queryWords = tokens.length;
    if (nameWords.length > 0 && queryWords > 0) {
      const wordRatio = queryWords / nameWords.length;
      if (wordRatio >= 1.0) {
        simplicityBonus = 80; // Query covers all words
      } else if (wordRatio >= 0.5) {
        simplicityBonus = Math.round(60 * wordRatio); // Proportional
      }
    }
    score += simplicityBonus;
    
    const isUserItem =
      (personId && food.personId === personId) ||
      prefs.isFavorite ||
      prefs.logCount > 0;
    const resultSource: FoodResultSource = isUserItem ? 'user' : 'curated';
    const scoreReadiness = scoreReadinessFromMicronutrients(food);
    const nutritionCompletenessScore = countMicronutrients(food);
    const rankingSignals = buildRankingSignals({
      trustRank: resultSource === 'user' ? 1 : 2,
      fallbackState: 'primary',
      nutritionConfidence: food.nutrientConfidence,
      scoreReadiness,
      readinessBasis: 'micronutrients',
      nutritionCompletenessScore,
      hasMacros: hasMacros(food),
    });

    // 5. QUALITY BONUSES
    let qualityBonus = 0;
    if (food.isVerified) qualityBonus += 10;
    if (prefs.logCount > 0) qualityBonus += Math.min(prefs.logCount * 2, 20);
    if (prefs.isFavorite) qualityBonus += 15;
    if (food.sourceProvider === 'usda' && food.nutrientConfidence === 'high') qualityBonus += 5;
    qualityBonus += getSourceTypePriority(food.sourceType) * 2;
    qualityBonus += getConfidencePriority(food.nutrientConfidence);
    if (hasMacros(food)) qualityBonus += 3;
    const nutritionQualityBonus = getNutritionQualityBonus(rankingSignals);
    qualityBonus += nutritionQualityBonus;
    score += qualityBonus;
    
    // 6. PROVISIONAL PENALTY
    let provisionalPenalty = 0;
    if (food.sourceType === 'provisional') {
      provisionalPenalty = 50;
      score -= provisionalPenalty;
    }
    
    // 7. BRAND-MISSING PENALTY (if we have brand tokens but this item has 0 brand hits)
    // This prevents generic "root beer" from ranking above "Barq's root beer"
    if (hasBrandTokens && brandGroupHits === 0) {
      score -= 100; // Significant penalty
    }

    const thinResultPenalty = getThinResultPenalty(rankingSignals);
    score -= thinResultPenalty;

    const analyticalNamePenalty = isAnalyticalCommonName(food.canonicalName) ? 60 : 0;
    score -= analyticalNamePenalty;

    // Phase 2: explicit provenance fields
    const result: FoodSearchResult = {
      food,
      group,
      score,
      isFavorite: prefs.isFavorite,
      logCount: prefs.logCount,
      tokenMatchCount: matchCount,
      brandGroupHits,
      matchedVariants,
      source: resultSource,
      source_rank: resultSource === 'user' ? 1 : 2,
      rankingSignals,
    };

    // Add to section bucket
    sectionBuckets[sectionKey].push(result);
    
    // Collect debug info for top results
    if (debug && debugBreakdowns.length < 20) {
      debugBreakdowns.push({
        id: food.id,
        name: food.canonicalName,
        brand: food.brandName,
        sourceType: food.sourceType,
        confidence: food.nutrientConfidence,
        tokenMatchCount: matchCount,
        brandGroupHits,
        matchedVariants,
        score,
        scoreBreakdown: {
          tokenScore,
          allTokenBonus,
          brandBonus,
          exactMatchBonus,
          phraseMatchBonus,
          simplicityBonus,
          qualityBonus,
          provisionalPenalty,
          nutritionQualityBonus,
          thinResultPenalty,
          analyticalNamePenalty,
        },
      });
    }
  }
  
  // === STEP 5b: Filter results when we have multi-token queries ===
  const filterByTokenCount = (results: FoodSearchResult[]): FoodSearchResult[] => {
    if (tokens.length <= 1 || maxTokenMatches <= 1) {
      return results;
    }
    
    // If we have any items matching all tokens, prefer those over
    // partial rows. For specific multi-token queries, partial matches
    // add more noise than value.
    const fullMatches = results.filter(r => (r.tokenMatchCount || 0) === tokens.length);
    if (fullMatches.length > 0) {
      return fullMatches;
    }
    
    // Also filter by brand hit if we have brand tokens
    if (hasBrandTokens && maxBrandHits > 0) {
      const brandMatches = results.filter(r => (r.brandGroupHits || 0) > 0);
      if (brandMatches.length >= 3) {
        return brandMatches;
      }
    }
    
    const minTokens = Math.max(1, maxTokenMatches - 1);
    return results.filter(r => (r.tokenMatchCount || 0) >= minTokens);
  };
  
  // Apply filtering to each section bucket (fallback buckets are populated later)
  const perSectionFilteredBuckets: Record<SectionKey, FoodSearchResult[]> = {
    my_foods:     filterByTokenCount(sectionBuckets.my_foods),
    common:       filterByTokenCount(sectionBuckets.common),
    branded:      filterByTokenCount(sectionBuckets.branded),
    scanned:      filterByTokenCount(sectionBuckets.scanned),
    other:        filterByTokenCount(sectionBuckets.other),
    promoted_off: [], // populated in fallback step (Phase 5)
    off:          [], // populated in fallback step (Phase 2/3/5)
  };

  const primaryCandidates = [
    ...perSectionFilteredBuckets.my_foods,
    ...perSectionFilteredBuckets.common,
    ...perSectionFilteredBuckets.branded,
    ...perSectionFilteredBuckets.scanned,
    ...perSectionFilteredBuckets.other,
  ];
  const globallyPreferredPrimary = pruneAnalyticalRowsForYogurtBrandQuery(
    narrowResultsForSpecificQuery(primaryCandidates, tokenGroups, hasBrandTokens),
    tokenGroups
  );
  const allowedPrimaryIds = new Set(globallyPreferredPrimary.map((result) => result.food.id));

  const filteredBuckets: Record<SectionKey, FoodSearchResult[]> = {
    my_foods: perSectionFilteredBuckets.my_foods.filter((result) => allowedPrimaryIds.has(result.food.id)),
    common: perSectionFilteredBuckets.common.filter((result) => allowedPrimaryIds.has(result.food.id)),
    branded: perSectionFilteredBuckets.branded.filter((result) => allowedPrimaryIds.has(result.food.id)),
    scanned: perSectionFilteredBuckets.scanned.filter((result) => allowedPrimaryIds.has(result.food.id)),
    other: perSectionFilteredBuckets.other.filter((result) => allowedPrimaryIds.has(result.food.id)),
    promoted_off: [],
    off: [],
  };

  instr.recordStage({ stage: 'score_and_group', ms: Date.now() - scoreStart, rows: deduped.length });

  // === STEP 6: Sort with DETERMINISTIC ordering ===
  const sortStart = Date.now();
  const sortFn = (a: FoodSearchResult, b: FoodSearchResult): number => {
    // 1. Score descending
    if (b.score !== a.score) return b.score - a.score;
    
    // 2. Token match count descending
    const aTokens = a.tokenMatchCount || 0;
    const bTokens = b.tokenMatchCount || 0;
    if (bTokens !== aTokens) return bTokens - aTokens;
    
    // 3. Brand group hits descending
    const aBrand = a.brandGroupHits || 0;
    const bBrand = b.brandGroupHits || 0;
    if (bBrand !== aBrand) return bBrand - aBrand;
    
    // 4. Source type priority descending
    const aSource = getSourceTypePriority(a.food.sourceType);
    const bSource = getSourceTypePriority(b.food.sourceType);
    if (bSource !== aSource) return bSource - aSource;
    
    // 5. Confidence priority descending
    const aConf = getConfidencePriority(a.food.nutrientConfidence);
    const bConf = getConfidencePriority(b.food.nutrientConfidence);
    if (bConf !== aConf) return bConf - aConf;
    
    // 6. Shorter name first (simpler foods win ties)
    const aLen = a.food.canonicalName.length;
    const bLen = b.food.canonicalName.length;
    if (aLen !== bLen) return aLen - bLen;
    
    // 7. Name ascending (alphabetical)
    const nameCompare = a.food.canonicalName.localeCompare(b.food.canonicalName);
    if (nameCompare !== 0) return nameCompare;
    
    // 8. ID ascending (final deterministic tie-breaker)
    return a.food.id.localeCompare(b.food.id);
  };
  
  // Sort each section's items
  for (const key of Object.keys(filteredBuckets) as SectionKey[]) {
    filteredBuckets[key].sort(sortFn);
  }
  instr.recordStage({ stage: 'sort', ms: Date.now() - sortStart });

  // === STEP 7: Build sections in DETERMINISTIC order ===
  const sectionsStart = Date.now();
  // Trust order: my_foods → common → branded → scanned → other → promoted_off → off
  // promoted_off and off start empty here; populated in STEP 7b fallback logic
  const SECTION_ORDER: SectionKey[] = ['my_foods', 'common', 'branded', 'scanned', 'other', 'promoted_off', 'off'];
  
  // For single-token queries, reserve slots for branded so they're always visible
  const BRANDED_RESERVED = (!requestedSection && tokens.length === 1 && filteredBuckets.branded.length > 0)
    ? Math.min(5, filteredBuckets.branded.length)
    : 0;
  const effectiveTotalLimit = BRANDED_RESERVED > 0 ? limit - BRANDED_RESERVED : limit;
  
  // If a specific section is requested (for "Show more"), only return that section
  const sectionsToProcess =
    requestedSection && (requestedSection === 'promoted_off' || requestedSection === 'off')
      ? []
      : requestedSection
        ? [requestedSection]
        : SECTION_ORDER;
  
  let totalShown = 0;
  const sections: SearchResultSection[] = [];
  
  for (const key of sectionsToProcess) {
    const items = filteredBuckets[key];
    const config = SECTION_CONFIG[key];
    
    // Skip empty sections unless specifically requested
    if (items.length === 0 && !requestedSection) continue;
    
    // Calculate top score for this section
    const topScore = items.length > 0 ? items[0].score : 0;
    
    // Determine offset and limit for this section
    const offset = requestedSection === key ? sectionOffset : 0;
    // For branded, use reserved slots; for others, use remaining from effectiveTotalLimit
    const budgetForSection = key === 'branded'
      ? (limit - totalShown) // Branded gets all remaining (including reserved)
      : (effectiveTotalLimit - totalShown);
    const remainingTotal = budgetForSection;
    
    // If we've hit the overall limit and no specific section requested, include metadata only
    if (remainingTotal <= 0 && !requestedSection) {
      sections.push({
        key,
        label: config.label,
        order: config.order,
        topScore,
        total: items.length,
        shown: 0,
        hasMore: items.length > 0,
        offset,
        items: [],
        // Legacy compatibility
        sourceType: key === 'my_foods' ? 'your_foods' : 
                   key === 'common' ? 'common' : 
                   key === 'branded' ? 'branded' : 
                   key === 'scanned' ? 'common' : 'common',
      });
      continue;
    }
    
    // Determine how many items to show from this section
    const effectiveLimit = requestedSection 
      ? sectionLimit  // "Show more" request: use full sectionLimit
      : Math.min(sectionLimit, remainingTotal);
    
    const shownItems = items.slice(offset, offset + effectiveLimit);
    
    sections.push({
      key,
      label: config.label,
      order: config.order,
      topScore,
      total: items.length,
      shown: shownItems.length,
      hasMore: items.length > offset + shownItems.length,
      offset,
      items: shownItems,
      // Legacy compatibility
      sourceType: key === 'my_foods' ? 'your_foods' : 
                 key === 'common' ? 'common' : 
                 key === 'branded' ? 'branded' : 
                 key === 'scanned' ? 'common' : 'common',
    });
    
    totalShown += shownItems.length;
  }
  
  // === STEP 7b: Phase 5 — Trust-ordered fallback (promoted_off → raw OFF) ===
  //
  // Thin-result gate (same rule as Phase 3):
  //   show fallback when curated == 0
  //   OR curated < 5 AND no near-exact curated match
  //
  // Trust order within fallback:
  //   1. promoted_off (admin-reviewed snapshots) — shown whenever gate triggers
  //   2. raw OFF      (last resort)              — shown only when total is still zero
  //
  // Both layers are capped at 5 items and appended after curated sections.
  const PROMOTED_OFF_LIMIT = 5;
  const OFF_FALLBACK_LIMIT = 5;
  const curatedCountForGate = totalShown;
  const curatedResults = sections.flatMap((s) => s.items);
  const nearExactExists =
    curatedCountForGate > 0
      ? hasNearExactCuratedMatch(originalRaw, curatedResults)
      : false;
  // Phase D — same-item promotion candidate set.
  //
  // A thin curated row is eligible to be replaced/suppressed by a usable
  // fallback OFF row if EITHER:
  //   (a) it has a strong cross-layer identity signal (UPC or UPC-like
  //       sourceId) — which lets us confirm same-item by ID alone, regardless
  //       of how few descriptor tokens it shares with the query; OR
  //   (b) it passes the legacy token-coverage gate
  //       (`isFallbackPromotionCandidate`) — which keeps the existing soft
  //       name+brand promotion path working when there's no UPC/source link.
  //
  // (a) is what closes the sparse-name suppression gap that Phase F-lite
  // golden tests had locked. (b) is preserved unchanged so behavior for
  // queries without UPC links stays identical.
  const thinCuratedPromotionCandidates = curatedResults.filter((result) => {
    if (result.source !== 'curated') return false;
    if (result.rankingSignals?.nutritionQualityTier !== 'thin') return false;
    if (hasStrongIdentitySignal(result)) return true;
    return isFallbackPromotionCandidate(result, originalRaw, tokenGroups, hasBrandTokens);
  });
  // Phase E — the hardcoded same-item OFF registry path was retired in
  // Phase D and removed entirely in Phase E. Same-item OFF rows are now
  // reached organically via `thinCuratedPromotionCandidates` +
  // `searchOffSameItemFallbackCandidates`, which uses real cross-layer
  // proofs (UPC, provider+source_id, name+brand) from `lib/food/sameItem`.
  const shouldPreferUsableFallbackOverThinCurated =
    !requestedSection && thinCuratedPromotionCandidates.length > 0;
  const showFallback =
    !requestedSection &&
    (
      curatedCountForGate === 0 ||
      (curatedCountForGate < 5 && !nearExactExists) ||
      shouldPreferUsableFallbackOverThinCurated
    );

  // Phase A — capture gate reason early so it's recorded even if no fallback runs.
  let fallbackGateReason: FoodSearchFallbackGateReason = 'no_fallback';
  if (requestedSection === 'promoted_off' || requestedSection === 'off') {
    fallbackGateReason = 'gate_show_more_section';
  } else if (showFallback) {
    if (curatedCountForGate === 0) fallbackGateReason = 'gate_zero_curated';
    else if (shouldPreferUsableFallbackOverThinCurated) fallbackGateReason = 'gate_thin_curated_promotion';
    else if (curatedCountForGate < 5 && !nearExactExists) fallbackGateReason = 'gate_thin_curated_no_near_exact';
  }

  // Phase A — observability state for fallback gate / winner rationale.
  let promotedResultsForGate: FoodSearchResult[] = [];
  let offResultsForGate: FoodSearchResult[] = [];
  let preferredFallbackForRationale: FoodSearchResult | null = null;
  const suppressedByPreferredFallback: string[] = [];

  if (showFallback) {
    let promotedResults: FoodSearchResult[] = [];
    let offResults: FoodSearchResult[] = [];

    // Layer 1: promoted OFF (higher trust than raw OFF)
    promotedResults = await searchPromotedOffFoods(tokenGroups, normalized, originalRaw, PROMOTED_OFF_LIMIT, instr);
    if (promotedResults.length > 0) {
      filteredBuckets.promoted_off = promotedResults;
      const promotedConfig = SECTION_CONFIG.promoted_off;
      const shownPromoted = promotedResults.slice(0, PROMOTED_OFF_LIMIT);
      sections.push({
        key: 'promoted_off',
        label: promotedConfig.label,
        order: promotedConfig.order,
        topScore: 0,
        total: promotedResults.length,
        shown: shownPromoted.length,
        hasMore: promotedResults.length > shownPromoted.length,
        offset: 0,
        items: shownPromoted,
        sourceType: 'common',
      });
      totalShown += shownPromoted.length;
    }

    // Layer 2: raw OFF — normally last resort, but also allowed when
    // the curated near-exact match is thin and a better nutrition-
    // connected version may exist in OFF for the same intended item.
    if (totalShown === 0 || shouldPreferUsableFallbackOverThinCurated) {
      if (shouldPreferUsableFallbackOverThinCurated) {
        const sameItemOffResults = await searchOffSameItemFallbackCandidates(
          thinCuratedPromotionCandidates,
          tokenGroups,
          normalized,
          originalRaw,
          OFF_FALLBACK_LIMIT,
          instr
        );
        if (sameItemOffResults.length > 0) {
          offResults = sameItemOffResults;
        }
        offResults.sort(compareFallbackRanking);
      }
      if (offResults.length === 0) {
        offResults = await searchOffFallback(tokenGroups, normalized, originalRaw, OFF_FALLBACK_LIMIT, instr);
      }
      if (offResults.length > 0) {
        filteredBuckets.off = offResults;
        const offConfig = SECTION_CONFIG.off;
        const shownOff = offResults.slice(0, OFF_FALLBACK_LIMIT);
        sections.push({
          key: 'off',
          label: offConfig.label,
          order: offConfig.order,
          topScore: 0,
          total: offResults.length,
          shown: shownOff.length,
          hasMore: offResults.length > shownOff.length,
          offset: 0,
          items: shownOff,
          sourceType: 'common',
        });
        totalShown += shownOff.length;
      }
    }

    const preferredFallback =
      findPreferredUsableFallbackMatch(originalRaw, thinCuratedPromotionCandidates, promotedResults) ??
      findPreferredUsableFallbackMatch(originalRaw, thinCuratedPromotionCandidates, offResults);

    if (preferredFallback) {
      preferredFallbackForRationale = preferredFallback;
      for (const section of sections) {
        if (section.key === 'promoted_off' || section.key === 'off') continue;

        section.items = section.items.filter((item) => {
          if (item.source !== 'curated') return true;

          // Phase D — same-item identity is now first-class. We compute the
          // strongest cross-layer proof up front and use it to decide whether
          // the suppression of a thin curated duplicate fires unconditionally
          // (UPC/source proofs) or still has to clear the legacy
          // token-coverage gate (soft name_brand proofs).
          const proof = proveSameItem(item, preferredFallback);

          if (item.rankingSignals?.nutritionQualityTier !== 'thin') return true;
          if (!proof) return true;

          // Strong proofs (UPC, provider+source_id) are sufficient on their
          // own to confirm same-item. Suppress regardless of descriptor token
          // coverage. This is the Phase D fix for sparse-name thin curated.
          if (isStrongProof(proof)) {
            suppressedByPreferredFallback.push(item.food.id);
            return false;
          }

          // Soft name_brand proofs still need the token-coverage guard so we
          // don't accidentally collapse two unrelated rows that share a few
          // generic tokens.
          if (!isFallbackPromotionCandidate(item, originalRaw, tokenGroups, hasBrandTokens)) {
            return true;
          }
          suppressedByPreferredFallback.push(item.food.id);
          return false;
        });
        section.total = section.items.length;
        section.shown = section.items.length;
        section.hasMore = false;
      }
    }

    if (!requestedSection) {
      for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i].total === 0 && sections[i].items.length === 0) {
          sections.splice(i, 1);
        }
      }
      totalShown = sections.reduce((sum, section) => sum + section.shown, 0);
    }

    promotedResultsForGate = promotedResults;
    offResultsForGate = offResults;
  }

  // Show More on 'promoted_off' section
  if (requestedSection === 'promoted_off') {
    const promotedResults = await searchPromotedOffFoods(tokenGroups, normalized, originalRaw, sectionLimit + sectionOffset, instr);
    promotedResults.sort(compareFallbackRanking);
    const paginated = promotedResults.slice(sectionOffset, sectionOffset + sectionLimit);
    const promotedConfig = SECTION_CONFIG.promoted_off;
    sections.push({
      key: 'promoted_off',
      label: promotedConfig.label,
      order: promotedConfig.order,
      topScore: 0,
      total: promotedResults.length,
      shown: paginated.length,
      hasMore: promotedResults.length > sectionOffset + sectionLimit,
      offset: sectionOffset,
      items: paginated,
      sourceType: 'common',
    });
  }

  // Show More on 'off' section, return paginated OFF results
  if (requestedSection === 'off') {
    const offResults = await searchOffFallback(tokenGroups, normalized, originalRaw, sectionLimit + sectionOffset, instr);
    offResults.sort(compareFallbackRanking);
    const paginated = offResults.slice(sectionOffset, sectionOffset + sectionLimit);
    const offConfig = SECTION_CONFIG.off;
    sections.push({
      key: 'off',
      label: offConfig.label,
      order: offConfig.order,
      topScore: 0,
      total: offResults.length,
      shown: paginated.length,
      hasMore: offResults.length > sectionOffset + sectionLimit,
      offset: sectionOffset,
      items: paginated,
      sourceType: 'common',
    });
  }

  instr.recordStage({ stage: 'sections', ms: Date.now() - sectionsStart });

  // Build flat results list (for backward compatibility)
  const slottedResults: FoodSearchResult[] = [];
  for (const section of sections) {
    slottedResults.push(...section.items);
  }

  // Phase A — finalize fallback gate debug + winner rationale ===
  const offSectionForGate = sections.find((s) => s.key === 'off');
  const promotedOffSectionForGate = sections.find((s) => s.key === 'promoted_off');
  const fallbackGateDebug: FoodSearchFallbackDebug = {
    reason: fallbackGateReason,
    curatedCount: curatedCountForGate,
    nearExactExists,
    thinCuratedPromotionCount: thinCuratedPromotionCandidates.length,
    preferredFallbackId: preferredFallbackForRationale?.food.id ?? null,
    preferredFallbackSource: preferredFallbackForRationale?.source ?? null,
    preferredFallbackName: preferredFallbackForRationale?.food.canonicalName ?? null,
    promotedOffShown: promotedOffSectionForGate?.shown ?? 0,
    offShown: offSectionForGate?.shown ?? 0,
  };
  instr.fallbackGate = fallbackGateDebug;

  // Map slottedResults to per-row rationale. groupKey now comes from
  // `lib/food/sameItem.getGroupKey` (Phase D) — UPC > source-id > name+brand
  // fingerprint. representativeReason is derived from the section the row was
  // selected from plus whether it was a fallback layer winner.
  for (let i = 0; i < slottedResults.length; i++) {
    const row = slottedResults[i];
    const sectionKey: SectionKey =
      row.source === 'promoted_off'
        ? 'promoted_off'
        : row.source === 'off'
          ? 'off'
          : (sections.find((s) => s.items.some((it) => it.food.id === row.food.id))?.key ?? 'other');
    let reason = 'primary_match';
    if (row.source === 'off' && fallbackGateReason === 'gate_thin_curated_promotion') {
      reason = 'fallback_same_item_promotion';
    } else if (row.source === 'off') {
      reason = 'fallback_off';
    } else if (row.source === 'promoted_off') {
      reason = 'fallback_promoted_off';
    }
    instr.winnerRationale.push({
      id: row.food.id,
      sectionKey,
      position: i + 1,
      source: (row.source ?? 'curated'),
      groupKey: buildGroupKeyForRationale(row),
      representativeReason: reason,
      // Only the top winner inherits all suppressed siblings (others get []).
      suppressedSiblingIds: i === 0 ? [...suppressedByPreferredFallback] : [],
    });
  }

  // Avoid unused-variable warnings when the helpers above don't fire; these
  // arrays are also exposed for future logging.
  void promotedResultsForGate;
  void offResultsForGate;

  // === Build response ===
  // Legacy fields (yourFoods, branded, common) - map from new sections
  const legacyYourFoods: FoodSearchResult[] = [];
  const legacyBranded: FoodSearchResult[] = [];
  const legacyCommon: FoodSearchResult[] = [];
  
  for (const section of sections) {
    if (section.key === 'my_foods') {
      legacyYourFoods.push(...section.items);
    } else if (section.key === 'branded') {
      legacyBranded.push(...section.items);
    } else {
      // common, scanned, other → legacy "common"
      legacyCommon.push(...section.items);
    }
  }
  
  // Total count across all sections (before caps)
  const totalCount = Object.values(filteredBuckets).reduce((sum, arr) => sum + arr.length, 0);
  
  const response: FoodSearchResponse = {
    results: slottedResults,
    sections,
    totalReturned: totalShown,
    // Legacy fields
    yourFoods: legacyYourFoods,
    branded: legacyBranded,
    common: legacyCommon,
    totalCount,
  };
  
  // === STEP 8: Phase 5 — Fire-and-forget search event logging ===
  if (!requestedSection) {
    const offSection          = sections.find((s) => s.key === 'off');
    const promotedOffSection  = sections.find((s) => s.key === 'promoted_off');
    const offShown            = offSection?.shown ?? 0;
    const promotedOffShown    = promotedOffSection?.shown ?? 0;
    const curatedCount        = totalShown - offShown - promotedOffShown;
    const eventType = totalShown === 0 ? 'search_zero_results' : 'search_executed';
    logSearchEvent({
      eventType,
      personId,
      sessionId,
      query: originalRaw,
      normalizedQuery: normalized,
      totalResultCount: totalShown,
      curatedResultCount: curatedCount,
      offResultCount: offShown + promotedOffShown, // all non-curated fallback items
      offFallbackShown: offShown > 0 || promotedOffShown > 0,
      nearExactMatchExisted: nearExactExists,
      pageContext: pageContext ?? undefined,
    }).catch(() => { /* non-fatal */ });

    // Packet 14: enqueue a missing-item request when the search truly
    // produced zero results (no curated, no promoted OFF, no raw OFF).
    // Fire-and-forget; any failure must not affect the search response.
    if (totalShown === 0 && (originalRaw ?? '').trim().length >= 2) {
      recordMissingItemRequest({
        personId,
        context: 'journal_search',
        sourceKind: 'search',
        sourceRef: sessionId ?? pageContext ?? null,
        rawInput: originalRaw,
        fallbackMetadata: {
          normalized_query: normalized,
          token_count: tokens.length,
          near_exact_match_existed: nearExactExists,
          page_context: pageContext ?? null,
        },
      }).catch(() => { /* non-fatal */ });
    }
  }

  // Add debug info
  if (debug) {
    // Sort debug breakdowns by score to show top 10
    debugBreakdowns.sort((a, b) => b.score - a.score);
    
    response.debug = {
      rawQuery: originalRaw,
      normalizedQuery: normalized,
      tokens,
      tokenGroups: tokenGroups.map(g => ({ 
        canonical: g.canonical, 
        dbVariants: g.dbVariants,
        displayVariants: g.displayVariants,
        isBrandLike: g.isBrandLike 
      })),
      searchMode,
      phaseAFilter,
      phaseBFilter,
      phaseACount,
      phaseBCount,
      finalCount: foodRows.length,
      dedupeCount: removedCount,
      hasBrandTokens,
      brandGroupVariants,
      top10Breakdown: debugBreakdowns.slice(0, 10),
      // Enhanced section debug
      sectionDebug: sections.map(s => ({
        key: s.key,
        label: s.label,
        order: s.order,
        topScore: s.topScore,
        totalBeforeCap: s.total,
        shownAfterCap: s.shown,
        offset: s.offset,
        top5Items: s.items.slice(0, 5).map(item => ({
          name: item.food.canonicalName,
          brand: item.food.brandName,
          score: item.score,
          sourceType: item.food.sourceType,
          sourceDataset: item.food.sourceDataset,
        })),
      })),
      sectionLimits: {
        perSection: sectionLimit,
        total: limit,
      },
      // Phase A — observability (additive, non-breaking).
      totalMs: instr.totalMs(),
      stageTimings: instr.stageTimings,
      retrieval: instr.retrieval,
      fallbackGate: instr.fallbackGate ?? undefined,
      winnerRationale: instr.winnerRationale,
      consumer: instr.consumer ?? undefined,
      brandEvidenceCacheSummary: getBrandEvidenceCacheSummary(),
    };

    debugLog('Step 7: Final Response', {
      totalCount: response.totalCount,
      totalReturned: response.totalReturned,
      sectionOrder: sections.map(s => `${s.key}(${s.topScore})`).join(' → '),
      sections: sections.map(s => ({
        key: s.key,
        label: s.label,
        topScore: s.topScore,
        total: s.total,
        shown: s.shown,
        offset: s.offset,
        hasMore: s.hasMore,
      })),
      top5: slottedResults.slice(0, 5).map(r => ({
        name: r.food.canonicalName,
        brand: r.food.brandName,
        score: r.score,
        group: r.group,
        sectionKey: determineSectionKey(r.food, personId, r.isFavorite, r.logCount),
      })),
    });
  }

  // Phase A — single structured server log line per request. Emitted always
  // (not gated on debug=true) so production browser-vs-API drift, slow
  // searches, and OFF lookup timeouts are visible without re-running the
  // request with debug=true. Single line, JSON-friendly fields.
  try {
    const topResult = slottedResults[0];
    console.info('[searchFoods.metrics]', JSON.stringify({
      query: originalRaw,
      normalized,
      tokens: tokens.length,
      brandTokens: hasBrandTokens,
      consumer: instr.consumer?.consumer ?? 'unknown',
      personId: personId ? 'auth' : 'anon',
      sessionId: sessionId ?? null,
      pageContext: pageContext ?? null,
      requestedSection: requestedSection ?? null,
      searchMode,
      totalMs: instr.totalMs(),
      stageMs: Object.fromEntries(instr.stageTimings.map((s) => [s.stage, s.ms])),
      stageRows: Object.fromEntries(
        instr.stageTimings.filter((s) => typeof s.rows === 'number').map((s) => [s.stage, s.rows])
      ),
      retrievalErrors: instr.retrieval.filter((r) => r.error).map((r) => ({ stage: r.stage, error: r.error })),
      retrievalCount: instr.retrieval.length,
      fallbackReason: fallbackGateReason,
      curatedCount: curatedCountForGate,
      promotedOffShown: instr.fallbackGate?.promotedOffShown ?? 0,
      offShown: instr.fallbackGate?.offShown ?? 0,
      suppressedSiblings: suppressedByPreferredFallback.length,
      preferredFallbackId: instr.fallbackGate?.preferredFallbackId ?? null,
      sectionsReturned: sections.map((s) => ({ key: s.key, total: s.total, shown: s.shown })),
      totalReturned: response.totalReturned,
      topResult: topResult
        ? {
            id: topResult.food.id,
            name: topResult.food.canonicalName,
            brand: topResult.food.brandName,
            source: topResult.source ?? null,
          }
        : null,
    }));
  } catch {
    /* logging is non-fatal; never block the response */
  }

  return response;
}

// ============================================================================
// UPC Lookup
// ============================================================================

export interface UpcLookupResult {
  found: boolean;
  food: FoodObject | null;
  isProvisional: boolean;
  needsEnrichment: boolean;
  matchedUpc?: string; // Which candidate matched (for debugging)
}

export interface UpcLookupOptions {
  createProvisional?: boolean;
  originalCode?: string; // Original user input (for provisional record naming)
}

/**
 * Look up food by UPC barcode.
 * 
 * Accepts either a single UPC string or an array of candidate UPCs.
 * When given an array, searches for all candidates and returns the first match
 * (in order of the array, which should be priority order).
 * 
 * Lookup order:
 * 1) Internal DB by UPC - prefer non-provisional matches (USDA branded, etc.)
 * 2) If no real match, check for existing provisional among candidates
 * 3) External lookup (STUB - not implemented yet)
 * 4) Create provisional record if none exists (allows immediate logging)
 * 
 * @param upcOrCandidates - Single UPC string or array of candidate UPCs
 * @param personId - User's person_id (for provisional record association)
 * @param options - Lookup options
 */
export async function lookupByUpc(
  upcOrCandidates: string | string[],
  personId: string | null,
  options: UpcLookupOptions = {}
): Promise<UpcLookupResult> {
  const { createProvisional = true, originalCode } = options;
  
  // Normalize input to array of candidates
  const candidates = Array.isArray(upcOrCandidates) 
    ? upcOrCandidates 
    : [upcOrCandidates, upcOrCandidates.replace(/^0+/, '')]; // Legacy: include stripped version
  
  // Remove duplicates while preserving order
  const uniqueCandidates = Array.from(new Set(candidates));
  
  if (uniqueCandidates.length === 0) {
    return { found: false, food: null, isProvisional: false, needsEnrichment: false };
  }
  
  // Debug logging (dev only)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[lookupByUpc] Searching for candidates:', uniqueCandidates);
  }
  
  // 1) Check internal DB using IN clause
  const { data: matches, error } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .eq('is_deleted', false)
    .in('upc', uniqueCandidates)
    .limit(20); // Get enough matches to find best one and check for provisionals

  if (error) {
    console.error('[lookupByUpc] Error:', error);
  }

  if (matches && matches.length > 0) {
    // Separate real foods from provisionals
    const realMatches: FoodObjectRow[] = [];
    const provisionalMatches: FoodObjectRow[] = [];
    
    for (const match of matches as FoodObjectRow[]) {
      if (match.source_type === 'provisional') {
        provisionalMatches.push(match);
      } else {
        realMatches.push(match);
      }
    }
    
    // PRIORITY 1: Prefer non-provisional matches (USDA branded, etc.)
    if (realMatches.length > 0) {
      let bestMatch: FoodObjectRow | null = null;
      let bestMatchIndex = Infinity;
      let matchedUpc: string | undefined;
      
      for (const match of realMatches) {
        const candidateIndex = uniqueCandidates.indexOf(match.upc || '');
        if (candidateIndex !== -1 && candidateIndex < bestMatchIndex) {
          bestMatch = match;
          bestMatchIndex = candidateIndex;
          matchedUpc = match.upc || undefined;
        }
      }
      
      if (bestMatch) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[lookupByUpc] Found real match:', { 
            matchedUpc, 
            candidateIndex: bestMatchIndex,
            name: bestMatch.canonical_name,
            sourceType: bestMatch.source_type,
          });
        }
        
        return {
          found: true,
          food: rowToFoodObject(bestMatch),
          isProvisional: false,
          needsEnrichment: false,
          matchedUpc,
        };
      }
    }
    
    // PRIORITY 2: Return existing provisional instead of creating duplicate
    if (provisionalMatches.length > 0) {
      let bestProvisional: FoodObjectRow | null = null;
      let bestProvisionalIndex = Infinity;
      let matchedUpc: string | undefined;
      
      for (const match of provisionalMatches) {
        const candidateIndex = uniqueCandidates.indexOf(match.upc || '');
        if (candidateIndex !== -1 && candidateIndex < bestProvisionalIndex) {
          bestProvisional = match;
          bestProvisionalIndex = candidateIndex;
          matchedUpc = match.upc || undefined;
        }
      }
      
      if (bestProvisional) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[lookupByUpc] Found existing provisional:', { 
            matchedUpc, 
            candidateIndex: bestProvisionalIndex,
            name: bestProvisional.canonical_name,
          });
        }
        
        return {
          found: true,
          food: rowToFoodObject(bestProvisional),
          isProvisional: true,
          needsEnrichment: true,
          matchedUpc,
        };
      }
    }
  }

  // Shared: canonical UPC for external + provisional use (hoisted to avoid duplicate imports)
  const { chooseCanonicalUpcForStorage } = await import('./upcNormalization');
  const canonicalUpc = chooseCanonicalUpcForStorage(uniqueCandidates);

  // 3) External lookup — Open Food Facts API
  const offFood = await lookupUpcFromOff(canonicalUpc, uniqueCandidates, personId);
  if (offFood) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[lookupByUpc] OFF API hit:', {
        upc: canonicalUpc,
        name: offFood.canonicalName,
      });
    }
    return {
      found: true,
      food: offFood,
      isProvisional: false,
      needsEnrichment: false,
      matchedUpc: offFood.upc ?? canonicalUpc,
    };
  }

  // 4) Create provisional record if allowed (no existing match found)
  if (createProvisional) {
    // Use original code for display, canonical format for storage
    const displayCode = originalCode || uniqueCandidates[0];
    const storageUpc = canonicalUpc;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[lookupByUpc] Creating new provisional:', { 
        displayCode,
        storageUpc,
        candidates: uniqueCandidates,
      });
    }
    
    const provisional = await createProvisionalFood(storageUpc, personId, displayCode);
    
    // Log for async enrichment
    await logSearch({
      personId,
      searchType: 'upc',
      query: displayCode,
      resultsCount: 0,
      needsEnrichment: true,
    });

    return {
      found: true,
      food: provisional,
      isProvisional: true,
      needsEnrichment: true,
      matchedUpc: storageUpc,
    };
  }

  return { found: false, food: null, isProvisional: false, needsEnrichment: false };
}

// ============================================================================
// External UPC Lookup — Open Food Facts API
// ============================================================================

/** Fields we extract from the OFF v2 product API response. */
interface OffApiProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  quantity?: string;
  image_front_url?: string;
  categories_tags?: string[];
  nutriments?: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
    /** sodium in grams per 100 g — multiply × 1000 for mg */
    sodium_100g?: number;
  };
}

/**
 * Attempt to fetch a product from the Open Food Facts API by UPC.
 * Returns a persisted FoodObject on success, or null on any failure
 * (network error, timeout, product not found, parse error).
 *
 * @param upc        - canonical UPC string to query
 * @param candidates - all UPC variants (for DB dupe-check before insert)
 * @param personId   - optional person context (not stored on the record)
 */
async function lookupUpcFromOff(
  upc: string,
  candidates: string[],
  personId: string | null,
): Promise<FoodObject | null> {
  const OFF_TIMEOUT_MS = 3_500;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);

    let apiRes: Response;
    try {
      apiRes = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json`,
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!apiRes.ok) return null;

    const json = (await apiRes.json()) as { status: number; product?: OffApiProduct };

    // status === 1 means product found in OFF
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const n = p.nutriments ?? {};

    // Normalise serving info using the shared utility
    const { normalizeOffRow } = await import('./offNormalization');
    const serving = normalizeOffRow({
      serving_size: p.serving_size ?? null,
      quantity: p.quantity ?? null,
      energy_kcal_100g: n['energy-kcal_100g'] ?? null,
      protein_g_100g: n.proteins_100g ?? null,
      carbs_g_100g: n.carbohydrates_100g ?? null,
      fat_g_100g: n.fat_100g ?? null,
      fiber_g_100g: n.fiber_100g ?? null,
      sugars_g_100g: n.sugars_100g ?? null,
      // OFF stores sodium as g/100g; our schema uses mg/100g
      sodium_mg_100g: n.sodium_100g != null ? n.sodium_100g * 1000 : null,
    });

    // Scale nutrients from per-100g to per serving
    const servingG = serving.serving_size_g ?? 100;
    const scale = servingG / 100;

    const scaleN = (v: number | null | undefined): number | null =>
      v != null ? Math.round(v * scale * 100) / 100 : null;

    const canonicalName = (p.product_name ?? '').trim() || `Unknown Product (${upc})`;
    const brandName = (p.brands ?? '').trim() || null;

    // Avoid duplicate OFF records for the same product if a previous call
    // raced and inserted one already (check by upc in off-sourced rows).
    const { data: existing } = await supabaseAdmin
      .from('food_objects')
      .select('id')
      .in('upc', candidates)
      .eq('source_provider', 'off')
      .maybeSingle();

    if (existing) {
      const { data: existingFull } = await supabaseAdmin
        .from('food_objects')
        .select('*')
        .eq('id', (existing as { id: string }).id)
        .single();
      if (existingFull) return rowToFoodObject(existingFull as FoodObjectRow);
    }

    const { data, error } = await supabaseAdmin
      .from('food_objects')
      .insert({
        canonical_name: canonicalName,
        brand_name: brandName,
        source_type: brandName ? 'branded' : 'common',
        source_provider: 'off',
        upc,
        serving_size_g: servingG,
        serving_unit: 'g',
        serving_description: serving.serving_size_text ?? null,
        calories: scaleN(n['energy-kcal_100g']),
        protein_g: scaleN(n.proteins_100g),
        carbs_g: scaleN(n.carbohydrates_100g),
        fat_g: scaleN(n.fat_100g),
        fiber_g: scaleN(n.fiber_100g),
        sugar_g: scaleN(n.sugars_100g),
        sodium_mg: n.sodium_100g != null ? scaleN(n.sodium_100g * 1000) : null,
        nutrient_provenance: 'usda', // "external label" — 'usda' is the closest enum value
        nutrient_confidence: serving.serving_confidence === 'high' ? 'high' : 'medium',
        image_url: p.image_front_url ?? null,
        category: p.categories_tags?.[0]?.replace(/^en:/, '') ?? null,
        is_verified: false,
      })
      .select()
      .single();

    if (error || !data) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[lookupUpcFromOff] DB insert failed:', error?.message);
      }
      return null;
    }

    return rowToFoodObject(data as FoodObjectRow);
  } catch (err) {
    // Timeout, network error, or parse failure — degrade gracefully
    if (process.env.NODE_ENV !== 'production') {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[lookupUpcFromOff] External lookup failed, falling back:', reason);
    }
    return null;
  }
}

/**
 * Create a provisional food record for unknown UPC.
 * User can log immediately; data will be enriched async.
 * 
 * @param upc - The UPC to store (normalized)
 * @param personId - User's person_id for association
 * @param displayCode - Optional display code for the name (original user input)
 */
async function createProvisionalFood(
  upc: string, 
  personId: string | null,
  displayCode?: string
): Promise<FoodObject> {
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .insert({
      canonical_name: `Unknown Product (${displayCode || upc})`,
      source_type: 'provisional',
      source_provider: 'scan',
      upc,
      serving_size_g: 100,
      serving_unit: 'g',
      serving_description: '1 serving (100g)',
      nutrient_provenance: 'estimated',
      nutrient_confidence: 'low',
      person_id: personId, // Associate with scanner for tracking
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create provisional food: ${error.message}`);
  }

  return rowToFoodObject(data as FoodObjectRow);
}

// ============================================================================
// Get Food by ID
// ============================================================================

export async function getFoodById(foodId: string): Promise<FoodObject | null> {
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .eq('id', foodId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return rowToFoodObject(data as FoodObjectRow);
}

// ============================================================================
// User Preferences
// ============================================================================

export async function toggleFavorite(personId: string, foodId: string): Promise<boolean> {
  // Check if preference exists
  const { data: existing } = await supabaseAdmin
    .from('user_food_preferences')
    .select('id, is_favorite')
    .eq('person_id', personId)
    .eq('food_object_id', foodId)
    .maybeSingle();

  if (existing) {
    // Toggle existing
    const { error } = await supabaseAdmin
      .from('user_food_preferences')
      .update({ is_favorite: !existing.is_favorite })
      .eq('id', existing.id);
    return !existing.is_favorite;
  } else {
    // Create new preference as favorite
    const { error } = await supabaseAdmin
      .from('user_food_preferences')
      .insert({
        person_id: personId,
        food_object_id: foodId,
        is_favorite: true,
      });
    return true;
  }
}

// ============================================================================
// List Favorites
// ============================================================================

/**
 * List all favorited foods for a person.
 * Returns FoodObjects with is_favorite = true from user_food_preferences.
 */
export async function listFavorites(personId: string): Promise<FoodObject[]> {
  // Get all favorited food_object_ids for this person
  const { data: prefs, error: prefsError } = await supabaseAdmin
    .from('user_food_preferences')
    .select('food_object_id')
    .eq('person_id', personId)
    .eq('is_favorite', true);

  if (prefsError) {
    console.error('[listFavorites] Error fetching preferences:', prefsError);
    return [];
  }

  if (!prefs || prefs.length === 0) {
    return [];
  }

  const foodIds = prefs.map((p) => p.food_object_id);

  // Fetch the actual food objects
  const { data: foods, error: foodsError } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .in('id', foodIds)
    .eq('is_deleted', false)
    .order('canonical_name', { ascending: true });

  if (foodsError) {
    console.error('[listFavorites] Error fetching foods:', foodsError);
    return [];
  }

  return (foods || []).map((row) => rowToFoodObject(row as FoodObjectRow));
}

/**
 * Set favorite status for a food item.
 * Unlike toggleFavorite, this sets an explicit value.
 */
export async function setFavorite(
  personId: string,
  foodId: string,
  isFavorite: boolean
): Promise<boolean> {
  // Check if preference exists
  const { data: existing } = await supabaseAdmin
    .from('user_food_preferences')
    .select('id')
    .eq('person_id', personId)
    .eq('food_object_id', foodId)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { error } = await supabaseAdmin
      .from('user_food_preferences')
      .update({ is_favorite: isFavorite })
      .eq('id', existing.id);
    if (error) {
      console.error('[setFavorite] Update error:', error);
      return false;
    }
  } else if (isFavorite) {
    // Create new preference only if favoriting
    const { error } = await supabaseAdmin
      .from('user_food_preferences')
      .insert({
        person_id: personId,
        food_object_id: foodId,
        is_favorite: true,
        log_count: 0,
      });
    if (error) {
      console.error('[setFavorite] Insert error:', error);
      return false;
    }
  }
  // If unfavoriting and no existing record, nothing to do
  return isFavorite;
}

export async function incrementLogCount(personId: string, foodId: string): Promise<void> {
  // Upsert preference with incremented log count
  const { data: existing } = await supabaseAdmin
    .from('user_food_preferences')
    .select('id, log_count')
    .eq('person_id', personId)
    .eq('food_object_id', foodId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('user_food_preferences')
      .update({ 
        log_count: existing.log_count + 1,
        last_logged_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('user_food_preferences')
      .insert({
        person_id: personId,
        food_object_id: foodId,
        log_count: 1,
        last_logged_at: new Date().toISOString(),
      });
  }
}

// ============================================================================
// Search Logging (for analytics / enrichment queue)
// ============================================================================

interface LogSearchArgs {
  personId: string | null;
  searchType: 'text' | 'upc';
  query: string;
  resultsCount: number;
  selectedFoodId?: string;
  needsEnrichment?: boolean;
}

async function logSearch(args: LogSearchArgs): Promise<void> {
  try {
    await supabaseAdmin.from('food_search_log').insert({
      person_id: args.personId,
      search_type: args.searchType,
      query: args.query,
      results_count: args.resultsCount,
      selected_food_id: args.selectedFoodId,
      needs_enrichment: args.needsEnrichment ?? false,
    });
  } catch (error) {
    console.error('[logSearch] Error (non-fatal):', error);
  }
}

// ============================================================================
// Phase 2: Search Event Analytics
// ============================================================================

interface SearchEventArgs {
  eventType: 'search_executed' | 'search_zero_results' | 'search_result_selected' | 'search_abandoned';
  personId?: string | null;
  sessionId?: string | null;
  query?: string;
  normalizedQuery?: string;
  totalResultCount?: number;
  curatedResultCount?: number;
  offResultCount?: number;
  offFallbackShown?: boolean;
  nearExactMatchExisted?: boolean;
  selectedFoodId?: string;
  selectedFoodSource?: FoodResultSource;
  selectedResultPosition?: number;
  pageContext?: string;
}

export async function logSearchEvent(args: SearchEventArgs): Promise<void> {
  try {
    await supabaseAdmin.from('food_search_events').insert({
      event_type: args.eventType,
      person_id: args.personId ?? null,
      session_id: args.sessionId ?? null,
      query: args.query ?? null,
      normalized_query: args.normalizedQuery ?? null,
      total_result_count: args.totalResultCount ?? null,
      curated_result_count: args.curatedResultCount ?? null,
      off_result_count: args.offResultCount ?? null,
      off_fallback_shown: args.offFallbackShown ?? null,
      near_exact_match_existed: args.nearExactMatchExisted ?? null,
      selected_food_id: args.selectedFoodId ?? null,
      selected_food_source: args.selectedFoodSource ?? null,
      selected_result_position: args.selectedResultPosition ?? null,
      page_context: args.pageContext ?? null,
    });
  } catch (err) {
    console.error('[logSearchEvent] Error (non-fatal):', err);
  }
}

// ============================================================================
// Phase 5: Promoted OFF Search (higher-trust fallback, before raw OFF)
// ============================================================================

interface PromotedOffRow {
  id: string;
  off_product_id: string;
  product_name: string;
  brands: string | null;
  barcode: string | null;
  serving_size_text: string | null;
  serving_size_g: number | null;
  calories_per_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugars_g_100g: number | null;
  sodium_mg_100g: number | null;
  completeness_score: number | null;
}

export function promotedOffRowToSearchResult(row: PromotedOffRow): FoodSearchResult {
  const hasNutrients =
    row.protein_g_100g != null || row.carbs_g_100g != null || row.fat_g_100g != null;

  const food: FoodObject = {
    id: `promoted_off:${row.off_product_id}`,
    canonicalName: row.product_name,
    brandName: row.brands ?? null,
    aliases: [],
    sourceType: row.brands ? 'branded' : 'common',
    sourceProvider: 'promoted_off',
    sourceId: row.off_product_id,
    sourceDataset: null,
    upc: row.barcode ?? null,
    servingSizeG: 100,                           // nutrition is per 100g
    servingUnit: 'g',
    servingDescription: '100g',
    householdServingText: row.serving_size_text, // promoted snapshot serving text
    measures: null,
    calories: row.calories_per_100g != null ? Number(row.calories_per_100g) : null,
    proteinG: row.protein_g_100g != null ? Number(row.protein_g_100g) : null,
    carbsG: row.carbs_g_100g != null ? Number(row.carbs_g_100g) : null,
    fatG: row.fat_g_100g != null ? Number(row.fat_g_100g) : null,
    fiberG: row.fiber_g_100g != null ? Number(row.fiber_g_100g) : null,
    sugarG: row.sugars_g_100g != null ? Number(row.sugars_g_100g) : null,
    sodiumMg: row.sodium_mg_100g != null ? Number(row.sodium_mg_100g) : null,
    nutrients: null,
    nutrientsExtended: {},
    nutrientProvenance: 'label',
    // Completeness >= 4 warrants high confidence; promoted items were admin-reviewed
    nutrientConfidence:
      row.completeness_score != null && row.completeness_score >= 4 ? 'high' : 'medium',
    personId: null,
    isVerified: false,
    imageUrl: null, // promoted_off_foods does not store image URLs
    category: null,
    tags: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  return {
    food,
    group: 'common',
    score: 0,
    isFavorite: false,
    logCount: 0,
    source: 'promoted_off',
    source_label: 'Reviewed Community Data',
    source_rank: 5,
    rankingSignals: buildRankingSignals({
      trustRank: 5,
      fallbackState: 'fallback_promoted_off',
      nutritionConfidence:
        row.completeness_score != null && row.completeness_score >= 4 ? 'high' : 'medium',
      scoreReadiness:
        row.completeness_score != null && row.completeness_score >= 4
          ? 'high'
          : row.completeness_score != null && row.completeness_score >= 2
            ? 'medium'
            : 'low',
      readinessBasis: 'off_completeness',
      nutritionCompletenessScore: row.completeness_score,
      hasMacros:
        row.protein_g_100g != null || row.carbs_g_100g != null || row.fat_g_100g != null,
      nutritionBasis: 'per_100g',
      servingConfidence: row.serving_size_g != null ? 'high' : 'medium',
    }),
  };
}

/**
 * Search promoted_off_foods for fallback results.
 * Only active promoted items are returned.
 * Matches on product_name and brands using the first search token.
 *
 * IMPORTANT: promoted_off_foods does NOT have a generic_name column (only
 * off_products_mirror does). Filters must be built with PROMOTED_OFF_TEXT_COLUMNS,
 * otherwise PostgREST returns "column promoted_off_foods.generic_name does
 * not exist" and the entire stage fails silently.
 */
async function searchPromotedOffFoods(
  tokenGroups: TokenGroup[],
  normalized: string,
  originalRaw: string,
  limit: number,
  instr?: SearchInstrumentation
): Promise<FoodSearchResult[]> {
  if (tokenGroups.length === 0) return [];
  const candidateLimit = Math.min(Math.max(limit * 8, 25), 100);
  const andFilter = buildMirrorAndGroupedFilter(tokenGroups, PROMOTED_OFF_TEXT_COLUMNS);
  const fallbackFilter = buildMirrorFallbackFilter(
    tokenGroups,
    originalRaw,
    ['off_product_id', 'barcode'],
    PROMOTED_OFF_TEXT_COLUMNS
  );

  const strictOutcome = instr
    ? await withRetrievalTiming<PromotedOffRow[]>(
        instr,
        'promoted_off_strict',
        'promoted_off_foods',
        digestFilter(andFilter),
        () =>
          supabaseAdmin
            .from('promoted_off_foods')
            .select(
              'id,off_product_id,product_name,brands,barcode,' +
                'serving_size_text,serving_size_g,' +
                'calories_per_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
                'fiber_g_100g,sugars_g_100g,sodium_mg_100g,completeness_score'
            )
            .eq('status', 'active')
            .not('product_name', 'is', null)
            .or(andFilter)
            .limit(candidateLimit) as unknown as Promise<{
            data: PromotedOffRow[] | null;
            error: { message?: string; code?: string } | null;
          }>
      )
    : await (async () => {
        const { data, error } = await supabaseAdmin
          .from('promoted_off_foods')
          .select(
            'id,off_product_id,product_name,brands,barcode,' +
              'serving_size_text,serving_size_g,' +
              'calories_per_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
              'fiber_g_100g,sugars_g_100g,sodium_mg_100g,completeness_score'
          )
          .eq('status', 'active')
          .not('product_name', 'is', null)
          .or(andFilter)
          .limit(candidateLimit);
        return { data: data as unknown as PromotedOffRow[] | null, error };
      })();
  if (strictOutcome.error) {
    console.error('[searchPromotedOffFoods] Strict query error:', strictOutcome.error.message);
  }

  let mergedRows = (strictOutcome.data as PromotedOffRow[] | null) ?? [];

  if (mergedRows.length < limit) {
    const fallbackOutcome = instr
      ? await withRetrievalTiming<PromotedOffRow[]>(
          instr,
          'promoted_off_fallback',
          'promoted_off_foods',
          digestFilter(fallbackFilter),
          () =>
            supabaseAdmin
              .from('promoted_off_foods')
              .select(
                'id,off_product_id,product_name,brands,barcode,' +
                  'serving_size_text,serving_size_g,' +
                  'calories_per_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
                  'fiber_g_100g,sugars_g_100g,sodium_mg_100g,completeness_score'
              )
              .eq('status', 'active')
              .not('product_name', 'is', null)
              .or(fallbackFilter)
              .limit(candidateLimit) as unknown as Promise<{
              data: PromotedOffRow[] | null;
              error: { message?: string; code?: string } | null;
            }>
        )
      : await (async () => {
          const { data, error } = await supabaseAdmin
            .from('promoted_off_foods')
            .select(
              'id,off_product_id,product_name,brands,barcode,' +
                'serving_size_text,serving_size_g,' +
                'calories_per_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
                'fiber_g_100g,sugars_g_100g,sodium_mg_100g,completeness_score'
            )
            .eq('status', 'active')
            .not('product_name', 'is', null)
            .or(fallbackFilter)
            .limit(candidateLimit);
          return { data: data as unknown as PromotedOffRow[] | null, error };
        })();
    const fallbackData = fallbackOutcome.data;
    const error = fallbackOutcome.error;
    if (error) {
      console.error('[searchPromotedOffFoods] Query error:', error.message);
    } else if (fallbackData) {
      const seen = new Set(mergedRows.map((row) => row.off_product_id));
      for (const row of fallbackData as PromotedOffRow[]) {
        if (!seen.has(row.off_product_id)) {
          seen.add(row.off_product_id);
          mergedRows.push(row);
        }
      }
    }
  }

  const rankedResults = mergedRows
    .map(promotedOffRowToSearchResult)
    .map((result) => applyFallbackLexicalRanking(result, tokenGroups, normalized, originalRaw))
    // Phase D: keep rows whose UPC equals the (UPC-shaped) raw query under
    // normalized leading-zero equivalence. Replaces the legacy strict-equal
    // check that silently dropped 12-digit query → 13-digit stored barcode.
    .filter((result) => (result.tokenMatchCount || 0) > 0 || isQueryUpcMatchForResult(originalRaw, result))
    .sort(compareFallbackRanking);

  const narrowed = narrowResultsForSpecificQuery(
    rankedResults,
    tokenGroups,
    tokenGroups.some((group) => group.isBrandLike)
  );

  return pruneFallbackPackForSpecificQuery(narrowed, tokenGroups, originalRaw).sort(compareFallbackRanking);
}

// ============================================================================
// Phase 2/3: OFF Mirror Fallback Search
// ============================================================================

interface OffMirrorRow {
  off_product_id: string;
  product_name: string | null;
  generic_name: string | null;
  brands: string | null;
  barcode: string | null;
  // Phase 3: serving fields (from OFF mirror columns)
  serving_size: string | null;
  quantity: string | null;
  // Nutrition per 100g
  energy_kcal_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugars_g_100g: number | null;
  sodium_mg_100g: number | null;
  image_front_url: string | null;
  image_url: string | null;
}

const OFF_MIRROR_SEARCH_SELECT =
  'off_product_id,product_name,generic_name,brands,barcode,' +
  'serving_size,quantity,' +
  'energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
  'fiber_g_100g,sugars_g_100g,sodium_mg_100g,image_front_url,image_url';

/**
 * Phase E — `getKnownSameItemOffProductIds` and
 * `searchKnownSameItemOffCandidates` were removed. Same-item OFF rows are
 * reached organically through `thinCuratedPromotionCandidates` and
 * `searchOffSameItemFallbackCandidates` (UPC and provider+source_id proofs
 * via `lib/food/sameItem`). The corresponding debug field
 * `FoodSearchFallbackDebug.knownSameItemOffProductIds` was also dropped.
 */

export function offMirrorRowToSearchResult(row: OffMirrorRow): FoodSearchResult {
  const name = row.product_name || row.generic_name || 'Unknown Product';
  const hasNutrients =
    row.protein_g_100g != null || row.carbs_g_100g != null || row.fat_g_100g != null;

  // Phase 3: derive serving normalization
  const norm = normalizeOffRow(row);

  const food: FoodObject = {
    id: `off:${row.off_product_id}`,
    canonicalName: name,
    brandName: row.brands || null,
    aliases: [],
    sourceType: row.brands ? 'branded' : 'common',
    sourceProvider: 'off',
    sourceId: row.off_product_id,
    sourceDataset: null,
    upc: row.barcode || null,
    servingSizeG: 100,                           // nutrition is per 100g
    servingUnit: 'g',
    servingDescription: '100g',
    householdServingText: norm.serving_size_text, // raw OFF serving text for display
    measures: null,
    calories: row.energy_kcal_100g != null ? Number(row.energy_kcal_100g) : null,
    proteinG: row.protein_g_100g != null ? Number(row.protein_g_100g) : null,
    carbsG: row.carbs_g_100g != null ? Number(row.carbs_g_100g) : null,
    fatG: row.fat_g_100g != null ? Number(row.fat_g_100g) : null,
    fiberG: row.fiber_g_100g != null ? Number(row.fiber_g_100g) : null,
    sugarG: row.sugars_g_100g != null ? Number(row.sugars_g_100g) : null,
    sodiumMg: row.sodium_mg_100g != null ? Number(row.sodium_mg_100g) : null,
    nutrients: null,
    nutrientsExtended: {},
    nutrientProvenance: 'label',
    nutrientConfidence: hasNutrients ? 'medium' : 'low',
    personId: null,
    isVerified: false,
    imageUrl: row.image_front_url || row.image_url || null,
    category: null,
    tags: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  return {
    food,
    group: 'common',
    score: 0,
    isFavorite: false,
    logCount: 0,
    source: 'off',
    source_label: 'Open Food Facts',
    source_rank: 10,
    rankingSignals: buildRankingSignals({
      trustRank: 10,
      fallbackState: 'fallback_off',
      nutritionConfidence: hasNutrients ? 'medium' : 'low',
      scoreReadiness:
        norm.completeness_score >= 4
          ? 'high'
          : norm.completeness_score >= 2
            ? 'medium'
            : 'low',
      readinessBasis: 'off_completeness',
      nutritionCompletenessScore: norm.completeness_score,
      hasMacros: hasNutrients,
      nutritionBasis: norm.nutrition_basis,
      servingConfidence: norm.serving_confidence,
    }),
    offNormalization: norm,
  };
}

async function searchOffSameItemFallbackCandidates(
  curatedPromotionCandidates: FoodSearchResult[],
  tokenGroups: TokenGroup[],
  normalized: string,
  originalRaw: string,
  limit: number,
  instr?: SearchInstrumentation
): Promise<FoodSearchResult[]> {
  if (curatedPromotionCandidates.length === 0) return [];

  const mergedRows: OffMirrorRow[] = [];
  const seen = new Set<string>();

  for (const candidate of curatedPromotionCandidates.slice(0, 3)) {
    const comparableIds = Array.from(
      new Set([
        ...getUpcVariants(candidate.food.upc),
        ...getUpcVariants(candidate.food.sourceId),
      ])
    );
    if (comparableIds.length === 0) continue;

    const outcome = instr
      ? await withRetrievalTiming<OffMirrorRow[]>(
          instr,
          'off_same_item_fallback',
          'off_products_mirror',
          `off_product_id IN (${comparableIds.length})`,
          () =>
            supabaseAdmin
              .from('off_products_mirror')
              .select(OFF_MIRROR_SEARCH_SELECT)
              .not('product_name', 'is', null)
              .in('off_product_id', comparableIds)
              .limit(Math.max(limit, 10)) as unknown as Promise<{
              data: OffMirrorRow[] | null;
              error: { message?: string; code?: string } | null;
            }>
        )
      : await (async () => {
          const { data, error } = await supabaseAdmin
            .from('off_products_mirror')
            .select(OFF_MIRROR_SEARCH_SELECT)
            .not('product_name', 'is', null)
            .in('off_product_id', comparableIds)
            .limit(Math.max(limit, 10));
          return { data: data as unknown as OffMirrorRow[] | null, error };
        })();

    const { data, error } = outcome;
    if (error) {
      console.error('[searchOffSameItemFallbackCandidates] Query error:', error.message);
      continue;
    }

    for (const row of (data as OffMirrorRow[] | null) ?? []) {
      if (seen.has(row.off_product_id)) continue;
      seen.add(row.off_product_id);
      mergedRows.push(row);
    }
  }

  return mergedRows
    .map(offMirrorRowToSearchResult)
    .map((result) => applyFallbackLexicalRanking(result, tokenGroups, normalized, originalRaw))
    .filter((result) =>
      curatedPromotionCandidates.some((candidate) => isSameFoodAcrossLayers(candidate, result))
    )
    .sort(compareFallbackRanking);
}

/**
 * Search OFF mirror for fallback results.
 *
 * Phase 3 cap: 5 items (down from 8).
 * Matches on product_name and brands using the first search token.
 */
async function searchOffFallback(
  tokenGroups: TokenGroup[],
  normalized: string,
  originalRaw: string,
  limit: number,
  instr?: SearchInstrumentation
): Promise<FoodSearchResult[]> {
  if (tokenGroups.length === 0) return [];
  const candidateLimit = Math.min(Math.max(limit * 8, 25), 120);
  const andFilter = buildMirrorAndGroupedFilter(tokenGroups);
  const fallbackFilter = buildMirrorFallbackFilter(tokenGroups, originalRaw, ['off_product_id', 'barcode']);

  const strictOutcome = instr
    ? await withRetrievalTiming<OffMirrorRow[]>(
        instr,
        'off_strict',
        'off_products_mirror',
        digestFilter(andFilter),
        () =>
          supabaseAdmin
            .from('off_products_mirror')
            .select(OFF_MIRROR_SEARCH_SELECT)
            .not('product_name', 'is', null)
            .or(andFilter)
            .limit(candidateLimit) as unknown as Promise<{
            data: OffMirrorRow[] | null;
            error: { message?: string; code?: string } | null;
          }>
      )
    : await (async () => {
        const { data, error } = await supabaseAdmin
          .from('off_products_mirror')
          .select(OFF_MIRROR_SEARCH_SELECT)
          .not('product_name', 'is', null)
          .or(andFilter)
          .limit(candidateLimit);
        return { data: data as unknown as OffMirrorRow[] | null, error };
      })();

  if (strictOutcome.error) {
    console.error('[searchOffFallback] Strict query error:', strictOutcome.error.message);
  }

  let mergedRows = (strictOutcome.data as OffMirrorRow[] | null) ?? [];

  if (mergedRows.length < limit) {
    const fallbackOutcome = instr
      ? await withRetrievalTiming<OffMirrorRow[]>(
          instr,
          'off_fallback',
          'off_products_mirror',
          digestFilter(fallbackFilter),
          () =>
            supabaseAdmin
              .from('off_products_mirror')
              .select(OFF_MIRROR_SEARCH_SELECT)
              .not('product_name', 'is', null)
              .or(fallbackFilter)
              .limit(candidateLimit) as unknown as Promise<{
              data: OffMirrorRow[] | null;
              error: { message?: string; code?: string } | null;
            }>
        )
      : await (async () => {
          const { data, error } = await supabaseAdmin
            .from('off_products_mirror')
            .select(OFF_MIRROR_SEARCH_SELECT)
            .not('product_name', 'is', null)
            .or(fallbackFilter)
            .limit(candidateLimit);
          return { data: data as unknown as OffMirrorRow[] | null, error };
        })();
    const fallbackData = fallbackOutcome.data;
    const error = fallbackOutcome.error;
    if (error) {
      console.error('[searchOffFallback] Query error:', error.message);
    } else if (fallbackData) {
      const seen = new Set(mergedRows.map((row) => row.off_product_id));
      for (const row of fallbackData as OffMirrorRow[]) {
        if (!seen.has(row.off_product_id)) {
          seen.add(row.off_product_id);
          mergedRows.push(row);
        }
      }
    }
  }

  const rankedResults = mergedRows
    .map(offMirrorRowToSearchResult)
    .map((result) => applyFallbackLexicalRanking(result, tokenGroups, normalized, originalRaw))
    // Phase D: normalized UPC equivalence for bare-UPC queries (see same-item
    // module). The legacy strict equality silently dropped 12-digit queries
    // matching 13-digit stored barcodes (e.g. "092227741095" vs "0092227741095").
    .filter((result) => (result.tokenMatchCount || 0) > 0 || isQueryUpcMatchForResult(originalRaw, result))
    .sort(compareFallbackRanking);

  const narrowed = narrowResultsForSpecificQuery(
    rankedResults,
    tokenGroups,
    tokenGroups.some((group) => group.isBrandLike)
  );

  return pruneFallbackPackForSpecificQuery(narrowed, tokenGroups, originalRaw).sort(compareFallbackRanking);
}

// ============================================================================
// Create Custom Food
// ============================================================================

/**
 * Determine nutrient confidence based on how many fields are provided.
 * - All macros + calories = 'medium'
 * - Some fields missing = 'low'
 */
function determineNutrientConfidence(input: CreateCustomFoodInput): NutrientConfidence {
  const hasCalories = typeof input.calories === 'number';
  const hasAllMacros = 
    typeof input.proteinG === 'number' &&
    typeof input.carbsG === 'number' &&
    typeof input.fatG === 'number';
  
  if (hasCalories && hasAllMacros) {
    return 'medium';
  }
  return 'low';
}

/**
 * Create a custom food item for a user.
 * 
 * - Sets source_type = 'user' (user-created custom food)
 * - Sets source_provider = 'fine_diet'
 * - Sets nutrient_provenance = 'user' (user-entered data)
 * - Determines confidence based on data completeness
 * - Optionally saves to favorites
 */
export async function createCustomFood(
  personId: string,
  input: CreateCustomFoodInput
): Promise<FoodObject> {
  const canonicalName = input.name.trim();
  const confidence = determineNutrientConfidence(input);
  
  // Build serving description
  const servingSizeG = input.servingSizeG ?? 100;
  const servingUnit = input.servingUnit ?? 'serving';
  const servingDescription = input.servingDescription ?? 
    (servingSizeG === 100 ? `1 ${servingUnit} (100g)` : `1 ${servingUnit} (${servingSizeG}g)`);
  
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .insert({
      canonical_name: canonicalName,
      brand_name: null,
      aliases: [canonicalName.toLowerCase()],
      source_type: 'user',
      source_provider: 'fine_diet',
      source_id: null,
      upc: null,
      
      // Serving
      serving_size_g: servingSizeG,
      serving_unit: servingUnit,
      serving_description: servingDescription,
      household_serving_text: input.householdServingText ?? null,
      
      // Base nutrients
      calories: input.calories ?? null,
      protein_g: input.proteinG ?? null,
      carbs_g: input.carbsG ?? null,
      fat_g: input.fatG ?? null,
      
      // Advanced micronutrients
      fiber_g: input.fiberG ?? null,
      sugar_g: input.sugarG ?? null,
      sodium_mg: input.sodiumMg ?? null,
      nutrients_extended: input.nutrientsExtended ?? {},
      
      // Provenance
      nutrient_provenance: 'user',
      nutrient_confidence: confidence,
      
      // Metadata
      person_id: personId,
      is_verified: false,
      is_deleted: false,
      image_url: null,
      category: null,
      tags: [],
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create custom food: ${error.message}`);
  }

  const food = rowToFoodObject(data as FoodObjectRow);

  // Save to favorites if requested (default ON for user-created foods)
  if (input.saveToFavorites !== false) {
    try {
      await supabaseAdmin
        .from('user_food_preferences')
        .upsert({
          person_id: personId,
          food_object_id: food.id,
          is_favorite: true,
          log_count: 0,
        }, {
          onConflict: 'person_id,food_object_id',
        });
    } catch (favError) {
      console.error('[createCustomFood] Failed to save favorite (non-fatal):', favError);
    }
  }

  return food;
}
