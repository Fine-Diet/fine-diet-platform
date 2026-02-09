/**
 * NDS Tier Calculation Utilities
 * 
 * Deterministic tier lookup functions for each NDS subscore.
 * All tier tables are defined as explicit constants for auditability.
 */

import {
  PAGA_TIERS,
  PCC_TIERS,
  FIBER_TIERS,
  ADDED_SUGAR_TIERS,
  MNC_TIERS,
  WFR_TIERS,
  PND_TIERS,
  OMEGA_RATIO_TIERS,
} from './types';

// ============================================================================
// Generic Tier Lookup Helpers
// ============================================================================

/**
 * Find points for a value in a descending min-threshold tier table.
 * Used for tiers where higher values = higher points.
 */
function lookupMinTier(
  value: number,
  tiers: ReadonlyArray<{ min: number; points: number }>
): number {
  for (const tier of tiers) {
    if (value >= tier.min) {
      return tier.points;
    }
  }
  // Should never reach here if tiers are properly defined with min: 0
  return tiers[tiers.length - 1]?.points ?? 0;
}

/**
 * Find points for a value in an ascending max-threshold tier table.
 * Used for tiers where lower values = higher points (e.g., added sugar).
 */
function lookupMaxTier(
  value: number,
  tiers: ReadonlyArray<{ max: number; points: number }>
): number {
  for (const tier of tiers) {
    if (value < tier.max) {
      return tier.points;
    }
  }
  // Exceeded all tiers
  return tiers[tiers.length - 1]?.points ?? 0;
}

// ============================================================================
// Protein Score Components
// ============================================================================

/**
 * Calculate PAGA (Protein Absolute Grams) points.
 * Higher protein grams = higher points.
 * 
 * @param proteinG - Total protein grams in meal
 * @returns Points 0-10
 */
export function calculatePAGAPoints(proteinG: number): number {
  return lookupMinTier(proteinG, PAGA_TIERS);
}

/**
 * Calculate PCC (Protein Calorie Contribution) points.
 * Higher protein percentage = higher points.
 * 
 * @param proteinG - Total protein grams in meal
 * @param mealKcal - Total calories in meal
 * @returns Points 0-10
 */
export function calculatePCCPoints(proteinG: number, mealKcal: number): number {
  if (mealKcal <= 0) return 2; // Minimum score if no calories
  
  // Protein contributes 4 kcal per gram
  const proteinKcal = proteinG * 4;
  const pccPct = proteinKcal / mealKcal;
  
  return lookupMinTier(pccPct, PCC_TIERS);
}

// ============================================================================
// Daily Subscore Tier Functions
// ============================================================================

/**
 * Calculate WFR (Whole Food Ratio) points.
 * Higher ratio of whole food calories = higher points.
 * 
 * @param wholeCredits - Sum of (food_kcal * WFR_credit) for all foods
 * @param totalKcal - Total calories consumed
 * @returns Points 0-10
 */
export function calculateWFRPoints(wholeCredits: number, totalKcal: number): number {
  if (totalKcal <= 0) return 5; // Neutral score if no food logged
  
  const ratio = wholeCredits / totalKcal;
  return lookupMinTier(ratio, WFR_TIERS);
}

/**
 * Calculate FP (Fiber Progress) points.
 * Higher fiber grams = higher points.
 * 
 * @param fiberG - Total fiber grams consumed today
 * @returns Points 0-10
 */
export function calculateFPPoints(fiberG: number): number {
  return lookupMinTier(fiberG, FIBER_TIERS);
}

/**
 * Calculate AS (Added Sugar) points.
 * LOWER sugar grams = HIGHER points (inverse relationship).
 * Source doc tiers are in grams/day: <10g=10, 10-19g=8, 20-29g=6, 30-39g=4, 40g+=2
 * 
 * @param addedSugarG - Total added sugar grams consumed today
 * @returns Points 0-10
 */
export function calculateASPoints(addedSugarG: number): number {
  return lookupMaxTier(addedSugarG, ADDED_SUGAR_TIERS);
}

/**
 * Calculate MNC (Micronutrient Coverage) points.
 * Higher coverage = higher points.
 * 
 * @param metCount - Number of micronutrients that meet 50% DRI
 * @param availableCount - Number of micronutrients with known intake (>0)
 * @returns Points 0-10
 */
export function calculateMNCPoints(metCount: number, availableCount: number): number {
  if (availableCount <= 0) return 5; // No data = neutral (don't penalize missing micronutrient data)
  
  const coverage = metCount / availableCount;
  return lookupMinTier(coverage, MNC_TIERS);
}

/**
 * Calculate PND (Phytonutrient Density) points.
 * More plant colors = higher points.
 * 
 * @param uniqueColors - Number of unique plant colors consumed today
 * @returns Points 0-10
 */
export function calculatePNDPoints(uniqueColors: number): number {
  return lookupMinTier(uniqueColors, PND_TIERS);
}

/**
 * Calculate OB (Omega Balance) points from ratio.
 * Better O3:O6 ratio = higher points.
 * 
 * @param omega3G - Total omega-3 grams consumed
 * @param omega6G - Total omega-6 grams consumed
 * @returns Points 0-10
 */
export function calculateOBPointsFromRatio(omega3G: number, omega6G: number): number {
  if (omega6G <= 0) {
    // No omega-6 data - can't calculate ratio
    return 5; // Neutral
  }
  if (omega3G <= 0) {
    return 2; // No omega-3 is poor
  }
  
  const ratio = omega3G / omega6G;
  return lookupMinTier(ratio, OMEGA_RATIO_TIERS);
}

/**
 * Calculate OB (Omega Balance) points using fallback heuristic.
 * Used when omega data is not available.
 * 
 * @param hasFish - Whether fish was consumed today
 * @param omega3PlantSourceCount - Number of omega-3 plant sources (chia, flax, walnuts)
 * @returns Points 0-10
 */
export function calculateOBPointsFallback(
  hasFish: boolean,
  omega3PlantSourceCount: number
): number {
  if (hasFish) return 10;
  if (omega3PlantSourceCount >= 2) return 8;
  if (omega3PlantSourceCount >= 1) return 6;
  return 2;
}

// ============================================================================
// Composite Scores
// ============================================================================

/**
 * Calculate meal Protein Score (PS_meal).
 * 
 * Formula: PS_meal = min(10, (0.625 * PAGA + 0.375 * PCC) * PSQ)
 * 
 * @param proteinG - Protein grams in meal
 * @param mealKcal - Calories in meal
 * @param psqMultiplier - Protein Source Quality multiplier (0.7-1.0)
 * @returns Protein score 0-10
 */
export function calculateMealProteinScore(
  proteinG: number,
  mealKcal: number,
  psqMultiplier: number
): number {
  const pagaPoints = calculatePAGAPoints(proteinG);
  const pccPoints = calculatePCCPoints(proteinG, mealKcal);
  
  // Weighted combination
  const baseScore = 0.625 * pagaPoints + 0.375 * pccPoints;
  
  // Apply PSQ multiplier and clamp to 0-10
  const finalScore = Math.min(10, baseScore * psqMultiplier);
  
  // Round to 2 decimal places
  return Math.round(finalScore * 100) / 100;
}
