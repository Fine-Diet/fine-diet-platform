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
  countTokenMatches,
  logSearchDebug,
  escapeForLike,
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
    searchMode: 'tokenized' | 'fallback_single' | 'fallback_prefix';
    rawResultCount: number;
    dedupeCount: number;
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
 * - Normalizes query (hyphens → spaces, lowercase, etc.)
 * - Tokenizes and matches ANY token (OR behavior)
 * - Ranks by token match count (more tokens = higher score)
 * - Deduplicates near-identical results
 * - Falls back to looser matching if strict returns 0
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

  // === STEP 1: Normalize query ===
  const { normalized, tokens, originalRaw } = normalizeSearchQuery(query);
  
  if (tokens.length === 0) {
    return emptyResponse;
  }
  
  logSearchDebug('Normalization', { originalRaw, normalized, tokens });
  
  // === STEP 2: Build and execute query ===
  let foodRows: FoodObjectRow[] = [];
  let searchMode: 'tokenized' | 'fallback_single' | 'fallback_prefix' = 'tokenized';
  
  // Stage 1: Tokenized OR search - match ANY token
  // Build OR conditions for all tokens across canonical_name and brand_name
  const orConditions = tokens.map(token => {
    const escapedToken = escapeForLike(token);
    return `canonical_name.ilike.%${escapedToken}%,brand_name.ilike.%${escapedToken}%`;
  }).join(',');
  
  const { data: tokenResults, error: tokenError } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .eq('is_deleted', false)
    .or(orConditions)
    .limit(limit * 4); // Fetch extra for deduplication and filtering

  if (tokenError) {
    console.error('[searchFoods] Token search error:', tokenError);
    return emptyResponse;
  }
  
  foodRows = (tokenResults || []) as FoodObjectRow[];
  
  // Stage 2: Fallback if no results
  if (foodRows.length === 0 && tokens.length > 0) {
    // Try single first token (common case: partial brand name)
    const firstToken = escapeForLike(tokens[0]);
    searchMode = 'fallback_single';
    
    const { data: fallbackResults } = await supabaseAdmin
      .from('food_objects')
      .select('*')
      .eq('is_deleted', false)
      .or(`canonical_name.ilike.%${firstToken}%,brand_name.ilike.%${firstToken}%`)
      .limit(limit * 2);
    
    foodRows = (fallbackResults || []) as FoodObjectRow[];
    
    // Stage 3: Prefix search as last resort
    if (foodRows.length === 0) {
      searchMode = 'fallback_prefix';
      
      const { data: prefixResults } = await supabaseAdmin
        .from('food_objects')
        .select('*')
        .eq('is_deleted', false)
        .or(`canonical_name.ilike.${firstToken}%,brand_name.ilike.${firstToken}%`)
        .limit(limit * 2);
      
      foodRows = (prefixResults || []) as FoodObjectRow[];
    }
  }
  
  logSearchDebug('Raw DB Results', { 
    count: foodRows.length, 
    searchMode,
    sampleIds: foodRows.slice(0, 5).map(r => r.id),
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

  for (const row of deduped) {
    const food = rowToFoodObject(row);
    const prefs = prefsMap.get(food.id) || { isFavorite: false, logCount: 0 };
    const group = determineSearchGroup(food, personId, prefs.isFavorite, prefs.logCount);
    
    // Calculate token match count for ranking
    const combinedText = `${food.canonicalName} ${food.brandName || ''}`.toLowerCase();
    const tokenMatchCount = countTokenMatches(combinedText, tokens);
    
    // Calculate relevance score
    let score = 0;
    const nameLower = food.canonicalName.toLowerCase();
    
    // Base score from token matches (0-100 based on proportion matched)
    const tokenScore = tokens.length > 0 
      ? Math.round((tokenMatchCount / tokens.length) * 50) 
      : 0;
    score += tokenScore;
    
    // Exact match bonus
    if (nameLower === normalized) {
      score += 50;
    } else if (nameLower.startsWith(tokens[0] || '')) {
      score += 30;
    } else if (nameLower.includes(normalized)) {
      score += 20;
    }
    
    // Quality bonuses
    if (food.isVerified) score += 10;
    if (prefs.logCount > 0) score += Math.min(prefs.logCount * 2, 20);
    if (prefs.isFavorite) score += 15;
    
    // Source quality bonuses
    if (food.sourceProvider === 'usda' && food.nutrientConfidence === 'high') score += 5;
    score += getSourceTypePriority(food.sourceType) * 2;
    score += getConfidencePriority(food.nutrientConfidence);
    
    // Macros bonus
    if (hasMacros(food)) score += 3;
    
    // Provisional penalty (push to bottom unless directly searched)
    if (food.sourceType === 'provisional') {
      score -= 50;
    }

    const result: FoodSearchResult = {
      food,
      group,
      score,
      isFavorite: prefs.isFavorite,
      logCount: prefs.logCount,
      tokenMatchCount,
    };

    if (group === 'your_foods') yourFoods.push(result);
    else if (group === 'branded') branded.push(result);
    else common.push(result);
  }

  // === STEP 6: Sort with DETERMINISTIC ordering ===
  const sortFn = (a: FoodSearchResult, b: FoodSearchResult): number => {
    // 1. Score descending
    if (b.score !== a.score) return b.score - a.score;
    
    // 2. Token match count descending
    const aTokens = a.tokenMatchCount || 0;
    const bTokens = b.tokenMatchCount || 0;
    if (bTokens !== aTokens) return bTokens - aTokens;
    
    // 3. Source type priority descending
    const aSource = getSourceTypePriority(a.food.sourceType);
    const bSource = getSourceTypePriority(b.food.sourceType);
    if (bSource !== aSource) return bSource - aSource;
    
    // 4. Confidence priority descending
    const aConf = getConfidencePriority(a.food.nutrientConfidence);
    const bConf = getConfidencePriority(b.food.nutrientConfidence);
    if (bConf !== aConf) return bConf - aConf;
    
    // 5. Name ascending (alphabetical)
    const nameCompare = a.food.canonicalName.localeCompare(b.food.canonicalName);
    if (nameCompare !== 0) return nameCompare;
    
    // 6. ID ascending (final deterministic tie-breaker)
    return a.food.id.localeCompare(b.food.id);
  };
  
  yourFoods.sort(sortFn);
  branded.sort(sortFn);
  common.sort(sortFn);

  // === STEP 7: Apply slotting rules ===
  const slottedResults: FoodSearchResult[] = [];
  const maxA = 2;
  const minB = 6;
  
  // Add Group A (up to maxA)
  slottedResults.push(...yourFoods.slice(0, maxA));
  
  // Add Group B (at least minB, or all if less)
  const bToAdd = Math.min(branded.length, Math.max(minB, limit - slottedResults.length - common.length));
  slottedResults.push(...branded.slice(0, bToAdd));
  
  // Fill rest with Group C
  const remaining = limit - slottedResults.length;
  slottedResults.push(...common.slice(0, remaining));

  // === Build response ===
  const response: FoodSearchResponse = {
    results: slottedResults.slice(0, limit),
    yourFoods: yourFoods.slice(0, maxA),
    branded: branded.slice(0, bToAdd),
    common: common.slice(0, remaining),
    totalCount: yourFoods.length + branded.length + common.length,
  };
  
  // Add debug info in dev mode
  if (debug) {
    response.debug = {
      normalizedQuery: normalized,
      tokens,
      searchMode,
      rawResultCount: foodRows.length,
      dedupeCount: removedCount,
    };
    
    logSearchDebug('Final Response', {
      totalCount: response.totalCount,
      yourFoodsCount: yourFoods.length,
      brandedCount: branded.length,
      commonCount: common.length,
      top10: slottedResults.slice(0, 10).map(r => ({
        name: r.food.canonicalName,
        score: r.score,
        tokenMatches: r.tokenMatchCount,
        group: r.group,
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
