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
import { hasNearExactCuratedMatch, normalizeOffRow } from './offNormalization';
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
  sourceDataset: string | null;  // USDA dataset: 'branded' | 'foundation' | 'sr_legacy' | 'survey' | 'fndds' | null
  upc: string | null;
  
  // Serving
  servingSizeG: number;
  servingUnit: string;
  servingDescription: string | null;
  householdServingText: string | null;
  /** USDA household portion measures (e.g. cup, tablespoon, oz). Null when unavailable. */
  measures: Array<{ unit: string; grams: number; label?: string }> | null;
  
  // Nutrients (per serving)
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  /** Detailed micronutrients (per serving), when available */
  nutrients?: {
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
  } | null;
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
  /** Source layer — explicit provenance. Off items are always lower trust than curated. */
  source?: FoodResultSource;
  /** Human-readable source label (e.g. "Open Food Facts"). Present for 'off' items. */
  source_label?: string;
  /** Numeric rank of trust (1=highest). user=1, curated=2, off=10. */
  source_rank?: number;
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
    simplicityBonus: number;
    qualityBonus: number;
    provisionalPenalty: number;
  };
}

/**
 * Section key for grouping search results.
 * Deterministic order: my_foods → common → branded → scanned → other → off
 */
export type SectionKey = 'my_foods' | 'common' | 'branded' | 'scanned' | 'other' | 'promoted_off' | 'off';

/** Source layer for provenance tagging. Trust order: user=1 > curated=2 > promoted_off=5 > off=10 */
export type FoodResultSource = 'user' | 'curated' | 'promoted_off' | 'off';

/**
 * Section configuration for display order and labels
 */
const SECTION_CONFIG: Record<SectionKey, { label: string; order: number }> = {
  my_foods:     { label: 'My Foods',               order: 1 },
  common:       { label: 'Common Foods',            order: 2 },
  branded:      { label: 'Branded',                 order: 3 },
  scanned:      { label: 'Scanned',                 order: 4 },
  other:        { label: 'Other',                   order: 5 },
  promoted_off: { label: 'Reviewed Community Data', order: 6 },
  off:          { label: 'Open Food Facts',          order: 7 },
};

/**
 * A search result section with pagination support.
 */
export interface SearchResultSection {
  key: SectionKey;         // Section identifier
  label: string;           // Display label
  order: number;           // Display order (1=first, higher=later)
  topScore: number;        // Highest score in this section
  total: number;           // Total items before cap
  shown: number;           // Items shown after cap
  hasMore: boolean;        // True if total > shown
  offset: number;          // Current offset (for pagination)
  items: FoodSearchResult[];
  // Legacy compatibility (deprecated)
  sourceType?: 'your_foods' | 'branded' | 'common';
}

// Default caps for search result sections
const DEFAULT_SECTION_LIMIT = 12;
const DEFAULT_TOTAL_LIMIT = 50;

export interface FoodSearchResponse {
  results: FoodSearchResult[];
  // Sections in deterministic order: my_foods → common → branded → scanned → other
  sections: SearchResultSection[];
  totalReturned: number;   // Total items across all sections after caps
  // Legacy grouped arrays (deprecated, use sections instead)
  yourFoods: FoodSearchResult[];
  branded: FoodSearchResult[];
  common: FoodSearchResult[];
  totalCount: number;
  // Debug info (dev only)
  debug?: {
    rawQuery: string;
    normalizedQuery: string;
    tokens: string[];
    tokenGroups: Array<{ canonical: string; dbVariants: string[]; displayVariants: string[]; isBrandLike: boolean }>;
    searchMode: 'and_grouped' | 'brand_gated_fallback' | 'fallback_prefix';
    phaseAFilter: string;
    phaseBFilter?: string;
    phaseACount: number;
    phaseBCount?: number;
    finalCount: number;
    dedupeCount: number;
    hasBrandTokens: boolean;
    brandGroupVariants: string[];
    top10Breakdown: SearchResultDebug[];
    // Section debug info
    sectionDebug?: Array<{
      key: SectionKey;
      label: string;
      order: number;
      topScore: number;
      totalBeforeCap: number;
      shownAfterCap: number;
      offset: number;
      top5Items?: Array<{
        name: string;
        brand: string | null;
        score: number;
        sourceType: string;
        sourceDataset: string | null;
      }>;
    }>;
    sectionLimits?: {
      perSection: number;
      total: number;
    };
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
  } = options;
  
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
  const { normalized, tokens, tokenGroups, originalRaw } = normalizeSearchQuery(query);
  
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
  const { data: andResults, error: andError } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .eq('is_deleted', false)
    .or(phaseAFilter)
    .limit(limit * 10); // Increased from 6 to 10 to reduce candidate cap risk

  if (andError) {
    console.error('[searchFoods] Phase A error:', andError.message);
    debugLog('Step 2A: Phase A ERROR', { error: andError.message, code: andError.code });
  } else {
    foodRows = (andResults || []) as FoodObjectRow[];
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
    
    const { data: orResults, error: orError } = await supabaseAdmin
      .from('food_objects')
      .select('*')
      .eq('is_deleted', false)
      .or(phaseBFilter)
      .limit(limit * 6);
    
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
      
      const { data: prefixResults } = await supabaseAdmin
        .from('food_objects')
        .select('*')
        .eq('is_deleted', false)
        .or(phaseBFilter)
        .limit(limit * 2);
      
      foodRows = (prefixResults || []) as FoodObjectRow[];
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
  const { deduped, removedCount } = deduplicateRows(foodRows);
  
  debugLog('Step 3: Deduplication', { 
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
  const debugBreakdowns: SearchResultDebug[] = [];

  for (const row of deduped) {
    const food = rowToFoodObject(row);
    const prefs = prefsMap.get(food.id) || { isFavorite: false, logCount: 0 };
    
    // Determine section key (for new sectioning) AND legacy group (for backward compat)
    const sectionKey = determineSectionKey(food, personId, prefs.isFavorite, prefs.logCount);
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

    // Phase 2: explicit provenance fields
    const isUserItem =
      (personId && food.personId === personId) ||
      prefs.isFavorite ||
      prefs.logCount > 0;
    const resultSource: FoodResultSource = isUserItem ? 'user' : 'curated';

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
          simplicityBonus,
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
  
  // Apply filtering to each section bucket (fallback buckets are populated later)
  const filteredBuckets: Record<SectionKey, FoodSearchResult[]> = {
    my_foods:     filterByTokenCount(sectionBuckets.my_foods),
    common:       filterByTokenCount(sectionBuckets.common),
    branded:      filterByTokenCount(sectionBuckets.branded),
    scanned:      filterByTokenCount(sectionBuckets.scanned),
    other:        filterByTokenCount(sectionBuckets.other),
    promoted_off: [], // populated in fallback step (Phase 5)
    off:          [], // populated in fallback step (Phase 2/3/5)
  };

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

  // === STEP 7: Build sections in DETERMINISTIC order ===
  // Trust order: my_foods → common → branded → scanned → other → promoted_off → off
  // promoted_off and off start empty here; populated in STEP 7b fallback logic
  const SECTION_ORDER: SectionKey[] = ['my_foods', 'common', 'branded', 'scanned', 'other', 'promoted_off', 'off'];
  
  // For single-token queries, reserve slots for branded so they're always visible
  const BRANDED_RESERVED = (!requestedSection && tokens.length === 1 && filteredBuckets.branded.length > 0)
    ? Math.min(5, filteredBuckets.branded.length)
    : 0;
  const effectiveTotalLimit = BRANDED_RESERVED > 0 ? limit - BRANDED_RESERVED : limit;
  
  // If a specific section is requested (for "Show more"), only return that section
  const sectionsToProcess = requestedSection 
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
  const nearExactExists =
    curatedCountForGate > 0
      ? hasNearExactCuratedMatch(originalRaw, sections.flatMap((s) => s.items))
      : false;
  const showFallback =
    !requestedSection &&
    (curatedCountForGate === 0 || (curatedCountForGate < 5 && !nearExactExists));

  if (showFallback) {
    // Layer 1: promoted OFF (higher trust than raw OFF)
    const promotedResults = await searchPromotedOffFoods(tokens, PROMOTED_OFF_LIMIT);
    if (promotedResults.length > 0) {
      filteredBuckets.promoted_off = promotedResults;
      const promotedConfig = SECTION_CONFIG.promoted_off;
      sections.push({
        key: 'promoted_off',
        label: promotedConfig.label,
        order: promotedConfig.order,
        topScore: 0,
        total: promotedResults.length,
        shown: promotedResults.length,
        hasMore: false,
        offset: 0,
        items: promotedResults,
        sourceType: 'common',
      });
      totalShown += promotedResults.length;
    }

    // Layer 2: raw OFF — only when curated + promoted_off is still zero
    if (totalShown === 0) {
      const offResults = await searchOffFallback(tokens, OFF_FALLBACK_LIMIT);
      if (offResults.length > 0) {
        filteredBuckets.off = offResults;
        const offConfig = SECTION_CONFIG.off;
        sections.push({
          key: 'off',
          label: offConfig.label,
          order: offConfig.order,
          topScore: 0,
          total: offResults.length,
          shown: offResults.length,
          hasMore: false,
          offset: 0,
          items: offResults,
          sourceType: 'common',
        });
        totalShown += offResults.length;
      }
    }
  }

  // Show More on 'promoted_off' section
  if (requestedSection === 'promoted_off') {
    const promotedResults = await searchPromotedOffFoods(tokens, sectionLimit + sectionOffset);
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
    const offResults = await searchOffFallback(tokens, sectionLimit + sectionOffset);
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

  // Build flat results list (for backward compatibility)
  const slottedResults: FoodSearchResult[] = [];
  for (const section of sections) {
    slottedResults.push(...section.items);
  }

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

function promotedOffRowToSearchResult(row: PromotedOffRow): FoodSearchResult {
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
  };
}

/**
 * Search promoted_off_foods for fallback results.
 * Only active promoted items are returned.
 * Matches on product_name and brands using the first search token.
 */
async function searchPromotedOffFoods(
  tokens: string[],
  limit: number
): Promise<FoodSearchResult[]> {
  if (tokens.length === 0) return [];

  const primaryToken = tokens[0].replace(/'/g, "''");
  const filter = `product_name.ilike.%${primaryToken}%,brands.ilike.%${primaryToken}%`;

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
    .or(filter)
    .limit(limit);

  if (error || !data) {
    if (error) console.error('[searchPromotedOffFoods] Query error:', error.message);
    return [];
  }

  return (data as PromotedOffRow[]).map(promotedOffRowToSearchResult);
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

function offMirrorRowToSearchResult(row: OffMirrorRow): FoodSearchResult {
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
    offNormalization: norm,
  };
}

/**
 * Search OFF mirror for fallback results.
 *
 * Phase 3 cap: 5 items (down from 8).
 * Matches on product_name and brands using the first search token.
 */
async function searchOffFallback(
  tokens: string[],
  limit: number
): Promise<FoodSearchResult[]> {
  if (tokens.length === 0) return [];

  const primaryToken = tokens[0].replace(/'/g, "''"); // escape single quotes for ilike

  let filter = `product_name.ilike.%${primaryToken}%,brands.ilike.%${primaryToken}%`;
  if (tokens[1]) {
    const secondToken = tokens[1].replace(/'/g, "''");
    filter += `,generic_name.ilike.%${secondToken}%`;
  }

  const { data, error } = await supabaseAdmin
    .from('off_products_mirror')
    .select(
      'off_product_id,product_name,generic_name,brands,barcode,' +
      'serving_size,quantity,' +
      'energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
      'fiber_g_100g,sugars_g_100g,sodium_mg_100g,image_front_url,image_url'
    )
    .not('product_name', 'is', null)
    .or(filter)
    .limit(limit);

  if (error || !data) {
    if (error) console.error('[searchOffFallback] Query error:', error.message);
    return [];
  }

  return (data as OffMirrorRow[]).map(offMirrorRowToSearchResult);
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
