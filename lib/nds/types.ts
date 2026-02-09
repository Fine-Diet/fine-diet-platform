/**
 * Nutrition Density Score (NDS) Types
 * 
 * Core types for the daily NDS calculation system.
 * NDS is a daily "so far today" score (0-100) composed of 7 subscores (0-10).
 */

// ============================================================================
// Processing Classification Types
// ============================================================================

/**
 * Fine Diet processing classification enum.
 * Used as the internal source of truth; NOVA is derived from this.
 */
export type ProcessingClass = 
  | 'whole'               // Unprocessed or minimally processed (NOVA 1)
  | 'minimally_processed' // Minimally processed foods (NOVA 2)
  | 'processed'           // Processed foods (NOVA 3)
  | 'ultra_processed';    // Ultra-processed foods (NOVA 4)

/**
 * Source of the processing classification.
 */
export type ProcessingSource = 'heuristic' | 'admin_override';

/**
 * NOVA classification (1-4), derived from ProcessingClass.
 */
export type NOVALevel = 1 | 2 | 3 | 4;

/**
 * Processing classification data stored on food objects.
 */
export interface FoodProcessingData {
  processing_class: ProcessingClass | null;
  classifier_version: string | null;
  classifier_confidence: number | null; // 0-1
  processing_source: ProcessingSource | null;
  
  // Override fields (null if no admin override)
  processing_class_override: ProcessingClass | null;
  override_reason: string | null;
  override_at: string | null;
  override_by: string | null;
}

// ============================================================================
// NDS Score Types
// ============================================================================

/**
 * The 7 subscores that make up the daily NDS.
 * Each is 0-10 scale.
 */
export interface NDSSubscores {
  wfr_10: number;      // Whole Food Ratio
  ps_10: number;       // Protein Score
  pnd_10: number;      // Phytonutrient Density
  fp_10: number;       // Fiber Progress
  as_10: number;       // Added Sugar (inverse - lower sugar = higher score)
  mnc_10: number;      // Micronutrient Coverage
  ob_10: number;       // Omega Balance
  sodium_10: number;   // Sodium (ideal range scoring)
}

/**
 * Daily NDS record stored in the database.
 * Note: Subscores are stored as flat columns in the database, not nested.
 */
export interface DailyNDS {
  id: string;
  person_id: string;
  date_local: string;  // YYYY-MM-DD
  nds_score_100: number;
  // Subscores as flat columns (matching database schema)
  wfr_10: number;
  ps_10: number;
  pnd_10: number;
  fp_10: number;
  as_10: number;
  mnc_10: number;
  ob_10: number;
  sodium_10: number;
  // Debug data (optional JSONB)
  debug_data?: Record<string, unknown>;
  // Versioning
  nds_version: string;
  classifier_version: string;
  created_at: string;
  updated_at: string;
}

/**
 * Weights for combining subscores into NDS100.
 * From source doc: WFR 25%, PS 20%, PND 10%, FP 10%, AS 10%, MNC 10%, OB 10%, Sodium 5%
 * Sum = 1.0 (0.25 + 0.20 + 0.10*5 + 0.05 = 1.0)
 * 
 * NDS100 = 10 * (weighted sum of 0-10 subscores) → 0-100 range
 */
export const NDS_WEIGHTS = {
  wfr: 0.25,     // Whole Food Ratio
  ps: 0.20,      // Protein Score
  pnd: 0.10,     // Phytonutrient Density
  fp: 0.10,      // Fiber Progress
  as: 0.10,      // Added Sugar
  mnc: 0.10,     // Micronutrient Coverage
  ob: 0.10,      // Omega Balance
  sodium: 0.05,  // Sodium
} as const;

// Verify weights sum to 1.0
const _weightSum = Object.values(NDS_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_weightSum - 1.0) > 0.001) {
  console.warn(`[NDS] Weights sum to ${_weightSum}, expected 1.0`);
}

// ============================================================================
// Meal-Level Types
// ============================================================================

/**
 * Meal-level derived data computed on log mutation.
 */
export interface MealDerivedData {
  /** Protein score for this meal (0-10) */
  protein_score_10: number | null;
  /** Whether this qualifies as a main meal (>=250 kcal) */
  is_main_meal: boolean;
  /** Total calories for this meal */
  meal_calories: number;
  /** Total protein grams for this meal */
  meal_protein_g: number;
  /** Protein source quality multiplier (0.7-1.0) */
  psq_multiplier: number;
}

/**
 * Protein score quality (PSQ) multiplier categories.
 */
export type ProteinSourceQuality = 
  | 'whole_dominant'      // Mostly whole/minimally processed → 1.0
  | 'mixed_whole_powder'  // Mixed whole + powder → 0.9
  | 'powder_dominant'     // Powder-dominant → 0.8
  | 'upf_dominant';       // Ultra-processed protein dominant → 0.7

// ============================================================================
// Version Constants
// ============================================================================

export const NDS_VERSION = 'nds_daily_2026-02-09.v2';
export const CLASSIFIER_VERSION = 'processing_classifier_2026-02-08.v1';

// ============================================================================
// Thresholds and Constants
// ============================================================================

/** Main meal calorie threshold */
export const MAIN_MEAL_KCAL_THRESHOLD = 250;

/** PAGA (Protein Absolute Grams) tier thresholds */
export const PAGA_TIERS = [
  { min: 35, points: 10 },
  { min: 25, points: 8 },
  { min: 15, points: 6 },
  { min: 10, points: 4 },
  { min: 0, points: 2 },
] as const;

/** PCC (Protein Calorie Contribution) tier thresholds */
export const PCC_TIERS = [
  { min: 0.30, points: 10 },
  { min: 0.20, points: 8 },
  { min: 0.15, points: 6 },
  { min: 0.10, points: 4 },
  { min: 0, points: 2 },
] as const;

/** PSQ (Protein Source Quality) multipliers */
export const PSQ_MULTIPLIERS: Record<ProteinSourceQuality, number> = {
  whole_dominant: 1.0,
  mixed_whole_powder: 0.9,
  powder_dominant: 0.8,
  upf_dominant: 0.7,
};

/** Fiber progress tier thresholds (source doc: >=30: 10, 25-29: 8, etc.) */
export const FIBER_TIERS = [
  { min: 30, points: 10 },
  { min: 25, points: 8 },
  { min: 20, points: 6 },
  { min: 15, points: 4 },
  { min: 0, points: 2 },
] as const;

/** Added sugar grams/day tier thresholds (inverse - lower is better, source doc) */
export const ADDED_SUGAR_TIERS = [
  { max: 10, points: 10 },   // <10g
  { max: 20, points: 8 },    // 10-19g
  { max: 30, points: 6 },    // 20-29g
  { max: 40, points: 4 },    // 30-39g
  { max: Infinity, points: 2 }, // 40g+
] as const;

/** Micronutrient coverage tier thresholds */
export const MNC_TIERS = [
  { min: 0.85, points: 10 },
  { min: 0.70, points: 8 },
  { min: 0.55, points: 6 },
  { min: 0.40, points: 4 },
  { min: 0, points: 2 },
] as const;

/** Whole Food Ratio tier thresholds (source doc: >=80%: 10, 70-79: 8, etc.) */
export const WFR_TIERS = [
  { min: 0.80, points: 10 },
  { min: 0.70, points: 8 },
  { min: 0.60, points: 6 },
  { min: 0.50, points: 4 },
  { min: 0, points: 2 },
] as const;

/** Phytonutrient density (plant color variety) tier thresholds */
export const PND_TIERS = [
  { min: 6, points: 10 },   // 6+ colors
  { min: 5, points: 8 },
  { min: 4, points: 6 },
  { min: 3, points: 4 },
  { min: 2, points: 2 },
  { min: 0, points: 1 },
] as const;

/** Omega balance ratio tier thresholds (O3:O6 ratio) */
export const OMEGA_RATIO_TIERS = [
  { min: 0.25, points: 10 },  // 1:4 or better
  { min: 0.15, points: 8 },   // ~1:6.7
  { min: 0.10, points: 6 },   // 1:10
  { min: 0.05, points: 4 },   // 1:20
  { min: 0, points: 2 },
] as const;

// ============================================================================
// DRI (Dietary Reference Intakes) for MNC Calculation
// ============================================================================

/**
 * Beta DRI values for micronutrient coverage calculation.
 * Source: NIH Office of Dietary Supplements RDAs for adults 19-50.
 * Using values that work for general adult population.
 */
export const BETA_DRI = {
  potassium_mg: 2600,      // AI for adults
  magnesium_mg: 400,       // RDA for males (lower for females)
  iron_mg: 8,              // RDA for males (higher for females)
  calcium_mg: 1000,        // RDA for adults
  zinc_mg: 11,             // RDA for males
  folate_ug: 400,          // RDA for adults
  vitamin_a_ug_rae: 900,   // RDA for males
  vitamin_c_mg: 90,        // RDA for males
  vitamin_d_ug: 15,        // RDA for adults
  vitamin_b12_ug: 2.4,     // RDA for adults
  sodium_mg: 2300,         // Upper limit (not used for MNC, used for penalty)
} as const;

/** Sodium tier thresholds (mg/day - source doc) */
export const SODIUM_TIERS = [
  { min: 1000, max: 2300, points: 10 },  // 1,500-2,300mg ideal range
  { min: 0, max: 2800, points: 8 },      // 2,301-2,800mg acceptable
  { min: 0, max: 3500, points: 6 },      // 2,801-3,500mg moderate
  { min: 0, max: 4500, points: 4 },      // 3,501-4,500mg high
] as const;

/** Threshold for "met" status in MNC (50% of DRI) */
export const MNC_MET_THRESHOLD = 0.5;
