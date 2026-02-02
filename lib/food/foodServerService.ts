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
}

export interface FoodSearchResponse {
  results: FoodSearchResult[];
  // Grouped for UI slotting
  yourFoods: FoodSearchResult[];    // Group A
  branded: FoodSearchResult[];      // Group B
  common: FoodSearchResult[];       // Group C
  totalCount: number;
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
 * Slotting rules (default):
 * - Up to 2 slots for Group A
 * - At least 6 slots for Group B
 * - Rest filled with Group C
 * - Reallocate if insufficient results in a group
 */
export async function searchFoods(
  query: string,
  personId: string | null,
  options: { limit?: number } = {}
): Promise<FoodSearchResponse> {
  const { limit = 20 } = options;
  
  if (!query || query.trim().length < 2) {
    return { results: [], yourFoods: [], branded: [], common: [], totalCount: 0 };
  }

  const searchTerms = query.trim().toLowerCase();
  
  // Search using ILIKE for simplicity (can upgrade to full-text search later)
  const { data: foodRows, error } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .eq('is_deleted', false)
    .or(`canonical_name.ilike.%${searchTerms}%,brand_name.ilike.%${searchTerms}%`)
    .order('is_verified', { ascending: false })
    .order('canonical_name', { ascending: true })
    .limit(limit * 2); // Fetch extra to allow for grouping/slotting

  if (error) {
    console.error('[searchFoods] Error:', error);
    return { results: [], yourFoods: [], branded: [], common: [], totalCount: 0 };
  }

  // Fetch user preferences if personId provided
  let prefsMap = new Map<string, { isFavorite: boolean; logCount: number }>();
  if (personId && foodRows && foodRows.length > 0) {
    const foodIds = foodRows.map((r: FoodObjectRow) => r.id);
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

  // Convert and group results
  const yourFoods: FoodSearchResult[] = [];
  const branded: FoodSearchResult[] = [];
  const common: FoodSearchResult[] = [];

  for (const row of (foodRows || []) as FoodObjectRow[]) {
    const food = rowToFoodObject(row);
    const prefs = prefsMap.get(food.id) || { isFavorite: false, logCount: 0 };
    const group = determineSearchGroup(food, personId, prefs.isFavorite, prefs.logCount);
    
    // Calculate relevance score (simple for now)
    let score = 0;
    const nameLower = food.canonicalName.toLowerCase();
    if (nameLower === searchTerms) score = 100;
    else if (nameLower.startsWith(searchTerms)) score = 80;
    else if (nameLower.includes(searchTerms)) score = 60;
    if (food.isVerified) score += 10;
    if (prefs.logCount > 0) score += Math.min(prefs.logCount * 2, 20);
    if (prefs.isFavorite) score += 15;
    // Boost high-confidence USDA foods (foundation dataset)
    if (food.sourceProvider === 'usda' && food.nutrientConfidence === 'high') score += 5;

    const result: FoodSearchResult = {
      food,
      group,
      score,
      isFavorite: prefs.isFavorite,
      logCount: prefs.logCount,
    };

    if (group === 'your_foods') yourFoods.push(result);
    else if (group === 'branded') branded.push(result);
    else common.push(result);
  }

  // Sort each group by score
  yourFoods.sort((a, b) => b.score - a.score);
  branded.sort((a, b) => b.score - a.score);
  common.sort((a, b) => b.score - a.score);

  // Apply slotting rules
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

  return {
    results: slottedResults.slice(0, limit),
    yourFoods: yourFoods.slice(0, maxA),
    branded: branded.slice(0, bToAdd),
    common: common.slice(0, remaining),
    totalCount: yourFoods.length + branded.length + common.length,
  };
}

// ============================================================================
// UPC Lookup
// ============================================================================

export interface UpcLookupResult {
  found: boolean;
  food: FoodObject | null;
  isProvisional: boolean;
  needsEnrichment: boolean;
}

/**
 * Look up food by UPC barcode.
 * 
 * Lookup order:
 * 1) Internal DB by UPC
 * 2) External lookup (STUB - not implemented yet)
 * 3) Create provisional record if not found (allows immediate logging)
 */
export async function lookupByUpc(
  upc: string,
  personId: string | null,
  options: { createProvisional?: boolean } = {}
): Promise<UpcLookupResult> {
  const { createProvisional = true } = options;
  
  // Normalize UPC (remove leading zeros for comparison, but keep original)
  const normalizedUpc = upc.replace(/^0+/, '');
  
  // 1) Check internal DB
  const { data: existing, error } = await supabaseAdmin
    .from('food_objects')
    .select('*')
    .eq('is_deleted', false)
    .or(`upc.eq.${upc},upc.eq.${normalizedUpc}`)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[lookupByUpc] Error:', error);
  }

  if (existing) {
    return {
      found: true,
      food: rowToFoodObject(existing as FoodObjectRow),
      isProvisional: existing.source_type === 'provisional',
      needsEnrichment: existing.source_type === 'provisional',
    };
  }

  // 2) External lookup (STUB for Phase 3)
  // TODO: Implement external provider lookups (Open Food Facts, USDA, etc.)
  // For now, skip to provisional creation

  // 3) Create provisional record if allowed
  if (createProvisional) {
    const provisional = await createProvisionalFood(upc, personId);
    
    // Log for async enrichment
    await logSearch({
      personId,
      searchType: 'upc',
      query: upc,
      resultsCount: 0,
      needsEnrichment: true,
    });

    return {
      found: true,
      food: provisional,
      isProvisional: true,
      needsEnrichment: true,
    };
  }

  return { found: false, food: null, isProvisional: false, needsEnrichment: false };
}

/**
 * Create a provisional food record for unknown UPC.
 * User can log immediately; data will be enriched async.
 */
async function createProvisionalFood(upc: string, personId: string | null): Promise<FoodObject> {
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .insert({
      canonical_name: `Unknown Product (${upc})`,
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
