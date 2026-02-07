/**
 * Admin Food Management Types
 * 
 * Types for admin food CRUD, bulk import, and merge operations.
 */

// ============================================================================
// Food Object Types
// ============================================================================

export type FoodSourceProvider = 'usda' | 'fine_diet' | 'user' | 'scan' | 'open_food_facts' | 'internal';
export type FoodSourceType = 'branded' | 'common' | 'user' | 'provisional';
export type FoodSourceDataset = 'branded' | 'foundation' | 'sr_legacy' | 'survey' | 'fndds' | null;
export type NutrientConfidence = 'high' | 'medium' | 'low';
export type NutrientProvenance = 'internal' | 'usda' | 'label' | 'estimated' | 'user';

// ============================================================================
// Score Readiness Types (for Nutrition Density Score)
// ============================================================================

/** Score readiness tier based on micronutrient completeness */
export type ScoreReadinessTier = 'LOW' | 'MED' | 'HIGH';

/**
 * Micronutrient fields used for Nutrition Density Score calculation.
 * All fields allow null - do NOT coerce blank to 0.
 */
export interface NutritionDensityScoreFields {
  // Required macros (must have for basic scoring)
  calories: number | null;  // kcal
  protein_g: number | null;
  fiber_g: number | null;
  
  // Recommended macros (allow null)
  carbs_g: number | null;
  fat_g: number | null;
  
  // Minerals (allow null)
  potassium_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  
  // Vitamins (allow null) - IMPORTANT: vitamin_a_ug_rae uses RAE
  folate_ug: number | null;
  vitamin_a_ug_rae: number | null;  // Retinol Activity Equivalents
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_b12_ug: number | null;
  
  // Penalty nutrient
  sodium_mg: number | null;
}

/** List of micronutrient field names for score readiness calculation */
export const MICRONUTRIENT_FIELDS: (keyof NutritionDensityScoreFields)[] = [
  'potassium_mg',
  'magnesium_mg',
  'iron_mg',
  'calcium_mg',
  'zinc_mg',
  'folate_ug',
  'vitamin_a_ug_rae',
  'vitamin_c_mg',
  'vitamin_d_ug',
  'vitamin_b12_ug',
  'sodium_mg',
];

/** All nutrient fields that need validation (>= 0) */
export const ALL_NUTRIENT_FIELDS = [
  'calories',
  'protein_g',
  'fiber_g',
  'carbs_g',
  'fat_g',
  'potassium_mg',
  'magnesium_mg',
  'iron_mg',
  'calcium_mg',
  'zinc_mg',
  'folate_ug',
  'vitamin_a_ug_rae',
  'vitamin_c_mg',
  'vitamin_d_ug',
  'vitamin_b12_ug',
  'sodium_mg',
  'sugar_g', // kept for backwards compatibility
] as const;

export interface AdminFoodObject {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  source_type: FoodSourceType;
  source_provider: FoodSourceProvider | null;
  source_id: string | null;
  source_dataset: FoodSourceDataset;
  upc: string | null;
  
  // Serving/basis fields
  serving_size_g: number;
  serving_unit: string;
  serving_description: string | null;
  household_serving_text: string | null;
  
  // Core macros (existing)
  calories: number | null;  // kcal
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;  // kept for backwards compatibility
  sodium_mg: number | null;  // penalty nutrient for NDS
  
  // NEW: Minerals for Nutrition Density Score
  potassium_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  
  // NEW: Vitamins for Nutrition Density Score
  folate_ug: number | null;
  vitamin_a_ug_rae: number | null;  // MUST be RAE (Retinol Activity Equivalents)
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_b12_ug: number | null;
  
  // Extended nutrients (JSONB for USDA data)
  nutrients_extended: Record<string, number> | null;
  nutrient_provenance: NutrientProvenance;
  nutrient_confidence: NutrientConfidence;
  
  person_id: string | null;
  is_verified: boolean;
  is_deleted: boolean;
  image_url: string | null;
  category: string | null;
  tags: string[];
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  merged_into_food_object_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CRUD Types
// ============================================================================

export interface AdminFoodListParams {
  query?: string;
  provider?: FoodSourceProvider;
  verified?: boolean;
  has_upc?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdminFoodListResponse {
  foods: AdminFoodObject[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminFoodCreateInput {
  canonical_name: string;
  brand_name?: string | null;
  aliases?: string[];
  upc?: string | null;
  
  // Serving/basis (serving_size_g defaults to 100, serving_unit defaults to 'g')
  serving_size_g?: number;
  serving_unit?: string;
  serving_description?: string | null;
  household_serving_text?: string | null;
  
  // Core macros
  calories?: number | null;  // kcal
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
  sugar_g?: number | null;  // kept for backwards compatibility
  sodium_mg?: number | null;  // penalty nutrient for NDS
  
  // Minerals for Nutrition Density Score
  potassium_mg?: number | null;
  magnesium_mg?: number | null;
  iron_mg?: number | null;
  calcium_mg?: number | null;
  zinc_mg?: number | null;
  
  // Vitamins for Nutrition Density Score
  folate_ug?: number | null;
  vitamin_a_ug_rae?: number | null;  // MUST be RAE
  vitamin_c_mg?: number | null;
  vitamin_d_ug?: number | null;
  vitamin_b12_ug?: number | null;
  
  nutrients_extended?: Record<string, number> | null;
  nutrient_confidence?: NutrientConfidence;
  image_url?: string | null;
  category?: string | null;
  tags?: string[];
  is_verified?: boolean;
  verification_notes?: string | null;
}

export interface AdminFoodUpdateInput extends Partial<AdminFoodCreateInput> {
  // All fields optional for PATCH
}

// ============================================================================
// Verification Types
// ============================================================================

export interface AdminFoodVerifyInput {
  verification_notes?: string | null;
}

// ============================================================================
// Bulk Import Types
// ============================================================================

/**
 * Bulk Import Row - matches the CSV template columns exactly.
 * 
 * CSV Template Column Order:
 * canonical_name, brand_name, upc, calories_kcal, protein_g, fiber_g, carbs_g, fat_g,
 * potassium_mg, magnesium_mg, iron_mg, calcium_mg, zinc_mg,
 * folate_ug, vitamin_a_ug_rae, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug,
 * sodium_mg, serving_size_g, serving_unit, serving_description, household_serving_text,
 * category, tags
 */
export interface BulkImportRow {
  canonical_name: string;
  brand_name?: string | null;
  upc?: string | null;
  
  // Macros (calories_kcal maps to calories in DB)
  calories_kcal?: number | null;
  protein_g?: number | null;
  fiber_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  
  // Minerals
  potassium_mg?: number | null;
  magnesium_mg?: number | null;
  iron_mg?: number | null;
  calcium_mg?: number | null;
  zinc_mg?: number | null;
  
  // Vitamins - IMPORTANT: vitamin_a_ug_rae uses RAE
  folate_ug?: number | null;
  vitamin_a_ug_rae?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_ug?: number | null;
  vitamin_b12_ug?: number | null;
  
  // Penalty
  sodium_mg?: number | null;
  
  // Serving/basis
  serving_size_g?: number | null;
  serving_unit?: string | null;
  serving_description?: string | null;
  household_serving_text?: string | null;
  
  // Metadata
  category?: string | null;
  tags?: string | null; // comma-separated in CSV
  
  // Deprecated (kept for backwards compatibility)
  calories?: number | null;  // alias for calories_kcal
  sugar_g?: number | null;   // kept for compatibility but not in new template
  image_url?: string | null;
  is_verified?: boolean | string | null; // can be 'true'/'false' string in CSV
}

export interface BulkImportValidationResult {
  row_index: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  action: 'create' | 'update' | 'skip';
  existing_id?: string;
  source_id: string;
  data: BulkImportRow;
}

export interface BulkImportDryRunResponse {
  total_rows: number;
  new_count: number;
  update_count: number;
  skip_count: number;
  error_count: number;
  errors: Array<{ row_index: number; errors: string[] }>;
  warnings: Array<{ row_index: number; warnings: string[] }>;
  preview: BulkImportValidationResult[];
}

export interface BulkImportApplyResponse {
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  error_count: number;
  inserted_ids: string[];
  updated_ids: string[];
  errors: Array<{ row_index: number; error: string }>;
}

// ============================================================================
// Merge Types
// ============================================================================

export interface MergeRequest {
  winner_id: string;
  loser_ids: string[];
  reason?: string;
}

export interface MergeImpactPreview {
  loser_id: string;
  user_food_preferences: number;
  food_search_log: number;
  journal_entries: number;
  journal_meal_templates: number;
  total: number;
}

export interface MergeDryRunResponse {
  winner: AdminFoodObject;
  losers: AdminFoodObject[];
  impact: MergeImpactPreview[];
  total_references: number;
}

export interface MergeResult {
  loser_id: string;
  success: boolean;
  references_moved: {
    user_food_preferences: number;
    food_search_log: number;
    journal_entries: number;
    journal_meal_templates: number;
  };
  error?: string;
}

export interface MergeApplyResponse {
  winner_id: string;
  results: MergeResult[];
  total_losers: number;
  successful_merges: number;
  failed_merges: number;
}

// ============================================================================
// Merge History Types
// ============================================================================

export interface FoodObjectMerge {
  id: string;
  winner_food_object_id: string;
  loser_food_object_id: string | null;
  merged_by: string | null;
  merged_at: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
