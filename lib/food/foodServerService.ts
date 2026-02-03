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
import {
  normalizeSearchQuery,
  normalizeForDedupe,
  countTokenGroupMatches,
  buildAndGroupedFilter,
  buildOrFallbackFilter,
  logSearchDebug,
  escapeForLike,
  type TokenGroup,
} from './searchNormalization';

// ============================================================================
// Types
// ============================================================================

export type FoodSourceType = 'branded' | 'common' | 'user' | 'provisional';
export type NutrientProvenance = 'internal' | 'usda' | 'label' | 'estimated' | 'user';
export type NutrientConfidence = 'high' | 'medium' | 'low';

/**
 * Input for creating a custom food item
 */
export interface CreateCustomFoodInput {
  // Required
  name: string;
  
  // Base nutrition (optional but encouraged)
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  
  // Serving info
  servingSizeG?: number;
  servingUnit?: string;
  servingDescription?: string;
  householdServingText?: string;
  
  // Advanced micronutrients (optional)
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  nutrientsExtended?: Record<string, number>;
  
  // Options
  saveToFavorites?: boolean;
}
export type SearchGroup = 'your_foods' | 'branded' | 'common';

export interface FoodObject {
  id: string;
  canonicalName: string;
  brandName: string | null;
  aliases: string[];
  sourceType: FoodSourceType;
  sourceProvider: string | null;
  sourceId: string | null;
  upc: string | null;
  
  // Serving
  servingSizeG: number;
  servingUnit: string;
  servingDescription: string | null;
  householdServingText: string | null;
  
  // Nutrients (per serving)
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  nutrientsExtended: Record<string, number>;
  
  // Provenance
  nutrientProvenance: NutrientProvenance;
  nutrientConfidence: NutrientConfidence;
  
  // Metadata
  personId: string | null;
  isVerified: boolean;
  imageUrl: string | null;
  category: string | null;
  tags: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface FoodSearchResult {
  food: FoodObject;
  group: SearchGroup;
  score: number;  // Relevance score for ranking within group
  isFavorite: boolean;
  logCount: number;
  tokenMatchCount?: number; // For debugging
  brandGroupHits?: number;  // How many brand-like token groups matched
  matchedVariants?: string[]; // Which token variants matched (debug)
}

// Debug info for a single search result
interface SearchResultDebug {
  id: string;
  name: string;
  brand: string | null;
  sourceType: string;
  confidence: string;
  tokenMatchCount: number;
  brandGroupHits: number;
  matchedVariants: string[];
  score: number;
  scoreBreakdown: {
    tokenScore: number;
    allTokenBonus: number;
    brandBonus: number;
    exactMatchBonus: number;
    qualityBonus: number;
    provisionalPenalty: number;
  };
}

export interface FoodSearchResponse {
  results: FoodSearchResult[];
  // Grouped for UI slotting
  yourFoods: FoodSearchResult[];    // Group A
  branded: FoodSearchResult[];      // Group B
  common: FoodSearchResult[];       // Group C
  totalCount: number;
  // Debug info (dev only)
  debug?: {
    normalizedQuery: string;
    tokens: string[];
    tokenGroups: Array<{ canonical: string; variants: string[]; isBrandLike: boolean }>;
    searchMode: 'and_grouped' | 'or_fallback' | 'fallback_prefix';
    filterUsed: string;
    rawResultCount: number;
    dedupeCount: number;
    top10Breakdown: SearchResultDebug[];
  };
}

interface FoodObjectRow {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  source_type: string;
  source_provider: string | null;
  source_id: string | null;
  upc: string | null;
  serving_size_g: number;
  serving_unit: string;
  serving_description: string | null;
  household_serving_text: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
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

function rowToFoodObject(row: FoodObjectRow): FoodObject {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    brandName: row.brand_name,
    aliases: row.aliases || [],
    sourceType: row.source_type as FoodSourceType,
    sourceProvider: row.source_provider,
    sourceId: row.source_id,
    upc: row.upc,
    servingSizeG: Number(row.serving_size_g),
    servingUnit: row.serving_unit,
    servingDescription: row.serving_description,
    householdServingText: row.household_serving_text,
    calories: row.calories !== null ? Number(row.calories) : null,
    proteinG: row.protein_g !== null ? Number(row.protein_g) : null,
    carbsG: row.carbs_g !== null ? Number(row.carbs_g) : null,
    fatG: row.fat_g !== null ? Number(row.fat_g) : null,
    fiberG: row.fiber_g !== null ? Number(row.fiber_g) : null,
    sugarG: row.sugar_g !== null ? Number(row.sugar_g) : null,
    sodiumMg: row.sodium_mg !== null ? Number(row.sodium_mg) : null,
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
  if (food.personId === personId || isFavorite || logCount > 0) {
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
 * - Normalizes query with apostrophe-safe token variants
 * - Uses AND-grouped matching (must match at least one variant from EACH token group)
 * - Ranks by token group coverage + brand-like token hits
 * - Deduplicates near-identical results
 * - Falls back to OR matching if AND returns 0
 */
export async function searchFoods(
  query: string,
  personId: string | null,
  options: { limit?: number; debug?: boolean } = {}
): Promise<FoodSearchResponse> {
  const { limit = 20, debug = process.env.SEARCH_DEBUG === 'true' } = options;
  
  const emptyResponse: FoodSearchResponse = { 
    results: [], 
    yourFoods: [], 
    branded: [], 
    common: [], 
    totalCount: 0 
  };
  
  if (!query || query.trim().length < 2) {
    return emptyResponse;
  }

  // === STEP 1: Normalize query with token groups ===
  const { normalized, tokens, tokenGroups, originalRaw } = normalizeSearchQuery(query);
  
  if (tokens.length === 0) {
    return emptyResponse;
  }
  
  // Count brand-like groups for scoring
  const brandLikeGroups = tokenGroups.filter(g => g.isBrandLike);
  const hasBrandTokens = brandLikeGroups.length > 0;
  
  logSearchDebug('Normalization', { 
    originalRaw, 
    normalized, 
    tokens,
    tokenGroups: tokenGroups.map(g => ({ 
      canonical: g.canonical, 
      variants: g.variants, 
      isBrandLike: g.isBrandLike 
    })),
    hasBrandTokens,
  });
  
  // === STEP 2: Build and execute query ===
  let foodRows: FoodObjectRow[] = [];
  let searchMode: 'and_grouped' | 'or_fallback' | 'fallback_prefix' = 'and_grouped';
  let filterUsed = '';
  
  // Stage 1: AND-grouped search (requires match from EACH token group)
  // This ensures "barq's root beer" finds items matching ALL of:
  // - (barq's OR barqs OR barq) in name/brand
  // - (root) in name/brand  
  // - (beer) in name/brand
  const andFilter = buildAndGroupedFilter(tokenGroups);
  filterUsed = andFilter;
  
  logSearchDebug('DB Query', { 
    mode: 'and_grouped',
    filter: andFilter.slice(0, 500) + (andFilter.length > 500 ? '...' : ''),
  });
  
  // Execute AND-grouped query
  // Note: For nested and/or, we need to use the filter parameter
  const { data: andResults, error: andError } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .eq('is_deleted', false)
    .or(andFilter)
    .limit(limit * 6); // Fetch more since AND is stricter

  if (andError) {
    console.error('[searchFoods] AND-grouped search error:', andError);
    // Fall through to OR fallback
  } else {
    foodRows = (andResults || []) as FoodObjectRow[];
  }
  
  // Stage 2: OR fallback if AND returns too few results
  if (foodRows.length < 5 && tokens.length > 0) {
    searchMode = 'or_fallback';
    
    const orFilter = buildOrFallbackFilter(tokenGroups);
    filterUsed = orFilter;
    
    logSearchDebug('DB Query Fallback', { 
      mode: 'or_fallback',
      reason: `AND returned only ${foodRows.length} rows`,
    });
    
    const { data: orResults, error: orError } = await supabaseAdmin
      .from('food_objects')
      .select('*')
      .eq('is_deleted', false)
      .or(orFilter)
      .limit(limit * 4);
    
    if (!orError && orResults) {
      // Merge with any AND results, preferring AND results
      const andIds = new Set(foodRows.map(r => r.id));
      const additionalRows = (orResults as FoodObjectRow[]).filter(r => !andIds.has(r.id));
      foodRows = [...foodRows, ...additionalRows];
    }
    
    // Stage 3: Prefix search as last resort
    if (foodRows.length === 0) {
      searchMode = 'fallback_prefix';
      const firstVariant = escapeForLike(tokenGroups[0]?.variants[0] || tokens[0]);
      filterUsed = `canonical_name.ilike.${firstVariant}%,brand_name.ilike.${firstVariant}%`;
      
      const { data: prefixResults } = await supabaseAdmin
        .from('food_objects')
        .select('*')
        .eq('is_deleted', false)
        .or(filterUsed)
        .limit(limit * 2);
      
      foodRows = (prefixResults || []) as FoodObjectRow[];
    }
  }
  
  logSearchDebug('Raw DB Results', { 
    count: foodRows.length, 
    searchMode,
    sampleNames: foodRows.slice(0, 5).map(r => r.canonical_name),
  });
  
  // === STEP 3: Deduplicate ===
  const { deduped, removedCount } = deduplicateRows(foodRows);
  
  logSearchDebug('Deduplication', { 
    before: foodRows.length, 
    after: deduped.length, 
    removed: removedCount,
  });

  // === STEP 4: Fetch user preferences ===
  let prefsMap = new Map<string, { isFavorite: boolean; logCount: number }>();
  if (personId && deduped.length > 0) {
    const foodIds = deduped.map((r) => r.id);
    const { data: prefs } = await supabaseAdmin
      .from('user_food_preferences')
      .select('food_object_id, is_favorite, log_count')
      .eq('person_id', personId)
      .in('food_object_id', foodIds);

    if (prefs) {
      for (const p of prefs) {
        prefsMap.set(p.food_object_id, { isFavorite: p.is_favorite, logCount: p.log_count });
      }
    }
  }

  // === STEP 5: Score and group results ===
  const yourFoods: FoodSearchResult[] = [];
  const branded: FoodSearchResult[] = [];
  const common: FoodSearchResult[] = [];
  
  // Track best token match for filtering
  let maxTokenMatches = 0;
  let maxBrandHits = 0;
  
  // For debug output
  const debugBreakdowns: SearchResultDebug[] = [];

  for (const row of deduped) {
    const food = rowToFoodObject(row);
    const prefs = prefsMap.get(food.id) || { isFavorite: false, logCount: 0 };
    const group = determineSearchGroup(food, personId, prefs.isFavorite, prefs.logCount);
    
    // Calculate token group matches with variant awareness
    const combinedText = `${food.canonicalName} ${food.brandName || ''}`;
    const { matchCount, brandGroupHits, matchedVariants } = countTokenGroupMatches(combinedText, tokenGroups);
    
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
    if (nameLower === normalized) {
      exactMatchBonus = 50;
    } else if (nameLower.startsWith(tokens[0] || '')) {
      exactMatchBonus = 30;
    } else if (nameLower.includes(normalized)) {
      exactMatchBonus = 20;
    }
    score += exactMatchBonus;
    
    // 5. QUALITY BONUSES
    let qualityBonus = 0;
    if (food.isVerified) qualityBonus += 10;
    if (prefs.logCount > 0) qualityBonus += Math.min(prefs.logCount * 2, 20);
    if (prefs.isFavorite) qualityBonus += 15;
    if (food.sourceProvider === 'usda' && food.nutrientConfidence === 'high') qualityBonus += 5;
    qualityBonus += getSourceTypePriority(food.sourceType) * 2;
    qualityBonus += getConfidencePriority(food.nutrientConfidence);
    if (hasMacros(food)) qualityBonus += 3;
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

    const result: FoodSearchResult = {
      food,
      group,
      score,
      isFavorite: prefs.isFavorite,
      logCount: prefs.logCount,
      tokenMatchCount: matchCount,
      brandGroupHits,
      matchedVariants,
    };

    if (group === 'your_foods') yourFoods.push(result);
    else if (group === 'branded') branded.push(result);
    else common.push(result);
    
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
          qualityBonus,
          provisionalPenalty,
        },
      });
    }
  }
  
  // === STEP 5b: Filter results when we have multi-token queries ===
  const filterByTokenCount = (results: FoodSearchResult[]): FoodSearchResult[] => {
    if (tokens.length <= 1 || maxTokenMatches <= 1) {
      return results;
    }
    
    // If we have items matching all tokens, strongly prefer those
    const fullMatches = results.filter(r => (r.tokenMatchCount || 0) === tokens.length);
    if (fullMatches.length >= 3) {
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
  
  // Apply filtering
  const filteredYourFoods = filterByTokenCount(yourFoods);
  const filteredBranded = filterByTokenCount(branded);
  const filteredCommon = filterByTokenCount(common);

  // === STEP 6: Sort with DETERMINISTIC ordering ===
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
    
    // 6. Name ascending (alphabetical)
    const nameCompare = a.food.canonicalName.localeCompare(b.food.canonicalName);
    if (nameCompare !== 0) return nameCompare;
    
    // 7. ID ascending (final deterministic tie-breaker)
    return a.food.id.localeCompare(b.food.id);
  };
  
  filteredYourFoods.sort(sortFn);
  filteredBranded.sort(sortFn);
  filteredCommon.sort(sortFn);

  // === STEP 7: Apply slotting rules ===
  const slottedResults: FoodSearchResult[] = [];
  const maxA = 2;
  const minB = 6;
  
  // Add Group A (up to maxA)
  slottedResults.push(...filteredYourFoods.slice(0, maxA));
  
  // Add Group B (at least minB, or all if less)
  const bToAdd = Math.min(filteredBranded.length, Math.max(minB, limit - slottedResults.length - filteredCommon.length));
  slottedResults.push(...filteredBranded.slice(0, bToAdd));
  
  // Fill rest with Group C
  const remaining = limit - slottedResults.length;
  slottedResults.push(...filteredCommon.slice(0, remaining));

  // === Build response ===
  const response: FoodSearchResponse = {
    results: slottedResults.slice(0, limit),
    yourFoods: filteredYourFoods.slice(0, maxA),
    branded: filteredBranded.slice(0, bToAdd),
    common: filteredCommon.slice(0, remaining),
    totalCount: filteredYourFoods.length + filteredBranded.length + filteredCommon.length,
  };
  
  // Add debug info
  if (debug) {
    // Sort debug breakdowns by score to show top 10
    debugBreakdowns.sort((a, b) => b.score - a.score);
    
    response.debug = {
      normalizedQuery: normalized,
      tokens,
      tokenGroups: tokenGroups.map(g => ({ 
        canonical: g.canonical, 
        variants: g.variants, 
        isBrandLike: g.isBrandLike 
      })),
      searchMode,
      filterUsed: filterUsed.slice(0, 300) + (filterUsed.length > 300 ? '...' : ''),
      rawResultCount: foodRows.length,
      dedupeCount: removedCount,
      top10Breakdown: debugBreakdowns.slice(0, 10),
    };
    
    logSearchDebug('Final Response', {
      totalCount: response.totalCount,
      yourFoodsCount: filteredYourFoods.length,
      brandedCount: filteredBranded.length,
      commonCount: filteredCommon.length,
      top5: slottedResults.slice(0, 5).map(r => ({
        name: r.food.canonicalName,
        brand: r.food.brandName,
        score: r.score,
        tokenMatches: r.tokenMatchCount,
        brandHits: r.brandGroupHits,
        matchedVariants: r.matchedVariants,
      })),
    });
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

  // 3) External lookup (STUB for Phase 3)
  // TODO: Implement external provider lookups (Open Food Facts, USDA, etc.)
  // For now, skip to provisional creation

  // 4) Create provisional record if allowed (no existing match found)
  if (createProvisional) {
    // Import canonical UPC chooser dynamically to avoid circular deps
    const { chooseCanonicalUpcForStorage } = await import('./upcNormalization');
    
    // Use original code for display, canonical format for storage
    const displayCode = originalCode || uniqueCandidates[0];
    const storageUpc = chooseCanonicalUpcForStorage(uniqueCandidates);
    
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
