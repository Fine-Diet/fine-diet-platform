/**
 * Nutrient Flag Engine — Phase 3D
 * 
 * Computes nutrient "flags" (insights) for a block of journal entries.
 * Flags surface in the Journal Day View as alert indicators with popovers.
 * 
 * Design principles:
 * - Deterministic: same inputs always produce same outputs
 * - Low noise: only flag actionable insights
 * - Data quality aware: flag estimated/low-confidence data
 */

import type { JournalEntry } from './types';

// ============================================================================
// Types
// ============================================================================

export type FlagSeverity = 'info' | 'warn' | 'high';

export interface Flag {
  key: string;
  severity: FlagSeverity;
  title: string;
  message: string;
}

/**
 * Minimal food object data needed for flag computation.
 * Fetched from food_objects table via batch endpoint.
 */
export interface FoodNutrientData {
  id: string;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  nutrientConfidence: 'high' | 'medium' | 'low';
  nutrientProvenance: 'internal' | 'usda' | 'label' | 'estimated' | 'user';
}

// ============================================================================
// Thresholds (tweakable constants)
// ============================================================================

export const FLAG_THRESHOLDS = {
  /** High sugar threshold per block (grams) */
  SUGAR_HIGH_G: 25,
  
  /** High sodium threshold per block (mg) - triggers 'warn' */
  SODIUM_WARN_MG: 800,
  
  /** Very high sodium threshold per block (mg) - triggers 'high' */
  SODIUM_HIGH_MG: 2000,
  
  /** Low fiber threshold per block (grams) */
  FIBER_LOW_G: 5,
  
  /** Minimum calories in block to trigger low fiber flag */
  FIBER_MIN_CALORIES: 300,
} as const;

// ============================================================================
// Flag Computation
// ============================================================================

interface ComputeFlagsInput {
  /** Journal entries for this block */
  entries: JournalEntry[];
  /** Map of foodObjectId -> nutrient data (from food_objects table) */
  foodNutrientMap: Map<string, FoodNutrientData>;
}

interface BlockTotals {
  calories: number;
  sugarG: number;
  sodiumMg: number;
  fiberG: number;
  hasLowConfidence: boolean;
  hasEstimatedData: boolean;
  hasMicronutrientData: boolean;
}

/**
 * Compute block totals from entries and their referenced food objects.
 */
function computeBlockTotals(
  entries: JournalEntry[],
  foodNutrientMap: Map<string, FoodNutrientData>
): BlockTotals {
  const totals: BlockTotals = {
    calories: 0,
    sugarG: 0,
    sodiumMg: 0,
    fiberG: 0,
    hasLowConfidence: false,
    hasEstimatedData: false,
    hasMicronutrientData: false,
  };

  for (const entry of entries) {
    if (entry.type !== 'intake') continue;

    const qty = entry.payload.quantity ?? 1;

    // Sum calories from payload, scaled by quantity
    if (typeof entry.payload.calories === 'number') {
      totals.calories += entry.payload.calories * qty;
    }

    // Get micronutrients from food_objects if available, scaled by quantity
    const foodId = entry.payload.foodObjectId;
    if (foodId) {
      const food = foodNutrientMap.get(foodId);
      if (food) {
        // Sum micronutrients (only if not null), scaled by quantity
        if (food.sugarG !== null) {
          totals.sugarG += food.sugarG * qty;
          totals.hasMicronutrientData = true;
        }
        if (food.sodiumMg !== null) {
          totals.sodiumMg += food.sodiumMg * qty;
          totals.hasMicronutrientData = true;
        }
        if (food.fiberG !== null) {
          totals.fiberG += food.fiberG * qty;
          totals.hasMicronutrientData = true;
        }

        // Check data quality
        if (food.nutrientConfidence === 'low') {
          totals.hasLowConfidence = true;
        }
        if (food.nutrientProvenance === 'estimated') {
          totals.hasEstimatedData = true;
        }
      }
    }
  }

  return totals;
}

/**
 * Compute nutrient flags for a block of entries.
 * 
 * @param input - Entries and food nutrient data map
 * @returns Flags sorted by severity (high -> warn -> info)
 */
export function computeFlags(input: ComputeFlagsInput): Flag[] {
  const { entries, foodNutrientMap } = input;
  
  if (entries.length === 0) {
    return [];
  }

  const totals = computeBlockTotals(entries, foodNutrientMap);
  const flags: Flag[] = [];

  // Only compute micronutrient flags if we have actual data
  if (totals.hasMicronutrientData) {
    // High sugar flag
    if (totals.sugarG >= FLAG_THRESHOLDS.SUGAR_HIGH_G) {
      flags.push({
        key: 'high_sugar',
        severity: 'high',
        title: 'Added sugar',
        message: 'High in added sugar.',
      });
    }

    // High sodium flag
    if (totals.sodiumMg >= FLAG_THRESHOLDS.SODIUM_HIGH_MG) {
      flags.push({
        key: 'high_sodium',
        severity: 'high',
        title: 'Sodium',
        message: 'Very high sodium for this meal block.',
      });
    } else if (totals.sodiumMg >= FLAG_THRESHOLDS.SODIUM_WARN_MG) {
      flags.push({
        key: 'warn_sodium',
        severity: 'warn',
        title: 'Sodium',
        message: 'High sodium for this meal block.',
      });
    }

    // Low fiber flag (only if calories >= threshold to avoid flagging tiny snacks)
    if (
      totals.fiberG < FLAG_THRESHOLDS.FIBER_LOW_G &&
      totals.calories >= FLAG_THRESHOLDS.FIBER_MIN_CALORIES
    ) {
      flags.push({
        key: 'low_fiber',
        severity: 'info',
        title: 'Fiber',
        message: 'Low fiber for this meal block.',
      });
    }
  }

  // Data quality flag
  if (totals.hasLowConfidence || totals.hasEstimatedData) {
    flags.push({
      key: 'data_quality',
      severity: 'info',
      title: 'Data quality',
      message: 'Some nutrition values are estimated.',
    });
  }

  // Sort by severity: high -> warn -> info
  const severityOrder: Record<FlagSeverity, number> = { high: 0, warn: 1, info: 2 };
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return flags;
}

/**
 * Get the severity color for UI display.
 */
export function getFlagSeverityColor(severity: FlagSeverity): string {
  switch (severity) {
    case 'high':
      return 'text-red-400';
    case 'warn':
      return 'text-yellow-400';
    case 'info':
      return 'text-blue-400';
    default:
      return 'text-gray-400';
  }
}

/**
 * Get the background color for the severity indicator.
 */
export function getFlagSeverityBg(severity: FlagSeverity): string {
  switch (severity) {
    case 'high':
      return 'bg-red-500';
    case 'warn':
      return 'bg-yellow-500';
    case 'info':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
}
