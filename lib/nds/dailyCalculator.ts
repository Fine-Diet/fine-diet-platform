/**
 * Daily NDS Calculator
 * 
 * Calculates the daily NDS (0-100) and all 7 subscores (0-10) from logged meals.
 * This is called by the recompute pipeline after meal mutations.
 */

import type { 
  NDSSubscores, 
  DailyNDS,
  ProcessingClass 
} from './types';
import { 
  NDS_WEIGHTS, 
  NDS_VERSION, 
  CLASSIFIER_VERSION,
  BETA_DRI,
  MNC_MET_THRESHOLD,
} from './types';
import {
  calculateWFRPoints,
  calculateFPPoints,
  calculateASPoints,
  calculateMNCPoints,
  calculatePNDPoints,
  calculateOBPointsFromRatio,
  calculateOBPointsFallback,
} from './tiers';
import { getNOVA, getWFRCredit } from './novaMapping';
import { countUniquePlantColors } from './plantColors';
import { countOmegaSources } from './omegaSources';

// ============================================================================
// Types
// ============================================================================

/**
 * Meal data needed for daily NDS calculation.
 * This comes from journal_entries with their derived data.
 */
export interface DailyMealData {
  id: string;
  /** Calories for this meal entry */
  calories: number;
  /** Protein grams */
  protein_g: number;
  /** Fiber grams */
  fiber_g: number;
  /** Added sugar grams (if tracked) */
  added_sugar_g?: number;
  /** Is this a main meal (>=250 kcal) */
  is_main_meal: boolean;
  /** Protein score for this meal (0-10) */
  protein_score_10: number | null;
  /** Foods in this meal with their data */
  foods: DailyFoodData[];
}

/**
 * Food data needed for daily calculations.
 */
export interface DailyFoodData {
  id: string;
  canonicalName: string;
  brandName?: string | null;
  category?: string | null;
  tags?: string[];
  /** Calories from this food */
  calories: number;
  /** Processing classification */
  processingClass?: ProcessingClass | null;
  processingClassOverride?: ProcessingClass | null;
  /** Micronutrients (per serving, scaled to logged amount) */
  nutrients?: {
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
    sodium_mg?: number | null;
  };
  /** Omega fatty acids (if available) */
  omega3_g?: number | null;
  omega6_g?: number | null;
}

/**
 * Debug data for detailed breakdown.
 */
export interface NDSDebugData {
  totalCalories: number;
  totalProtein: number;
  totalFiber: number;
  totalAddedSugar: number;
  wfr: {
    wholeCreditKcal: number;
    totalKcal: number;
    ratio: number;
  };
  ps: {
    mainMealCount: number;
    allMealCount: number;
    usedMainMeals: boolean;
    weightedSum: number;
    totalWeight: number;
  };
  pnd: {
    uniqueColors: number;
    colorsList: string[];
  };
  mnc: {
    metCount: number;
    availableCount: number;
    coverage: number;
    nutrientDetails: Record<string, { value: number; dri: number; met: boolean }>;
  };
  ob: {
    omega3Total: number;
    omega6Total: number;
    ratio: number | null;
    usedFallback: boolean;
    hasFish: boolean;
    plantSourceCount: number;
  };
}

/**
 * Result of daily NDS calculation.
 */
export interface DailyNDSResult {
  nds_score_100: number;
  subscores: NDSSubscores;
  nds_version: string;
  classifier_version: string;
  debug_data?: NDSDebugData;
}

// ============================================================================
// Subscore Calculations
// ============================================================================

/**
 * Calculate PS_current (Protein Score) from meals.
 * 
 * Decision 1: If no main meals yet, PS_current = average(all meals so far).
 * Otherwise: calorie-weighted average of main meals' protein_score_10.
 */
function calculatePS(meals: DailyMealData[]): { score: number; debug: NDSDebugData['ps'] } {
  const mainMeals = meals.filter(m => m.is_main_meal && m.protein_score_10 !== null);
  const allMeals = meals.filter(m => m.protein_score_10 !== null);
  
  let score: number;
  let usedMainMeals: boolean;
  let weightedSum = 0;
  let totalWeight = 0;
  
  if (mainMeals.length > 0) {
    // Use calorie-weighted average of main meals
    usedMainMeals = true;
    for (const meal of mainMeals) {
      const weight = meal.calories;
      weightedSum += (meal.protein_score_10 || 0) * weight;
      totalWeight += weight;
    }
    score = totalWeight > 0 ? weightedSum / totalWeight : 5;
  } else if (allMeals.length > 0) {
    // Decision 1: No main meals - average all meals
    usedMainMeals = false;
    for (const meal of allMeals) {
      weightedSum += meal.protein_score_10 || 0;
      totalWeight += 1;
    }
    score = totalWeight > 0 ? weightedSum / totalWeight : 5;
  } else {
    // No meals with protein score
    usedMainMeals = false;
    score = 5; // Neutral default
  }
  
  return {
    score: Math.round(score * 100) / 100,
    debug: {
      mainMealCount: mainMeals.length,
      allMealCount: allMeals.length,
      usedMainMeals,
      weightedSum: Math.round(weightedSum * 100) / 100,
      totalWeight: Math.round(totalWeight * 100) / 100,
    },
  };
}

/**
 * Calculate WFR_current (Whole Food Ratio).
 * 
 * Decision 2: NOVA3 gets partial credit (0.5).
 */
function calculateWFR(foods: DailyFoodData[]): { score: number; debug: NDSDebugData['wfr'] } {
  let wholeCreditKcal = 0;
  let totalKcal = 0;
  
  for (const food of foods) {
    const kcal = food.calories || 0;
    totalKcal += kcal;
    
    // Get NOVA level
    const nova = getNOVA({
      processing_class: food.processingClass || null,
      processing_class_override: food.processingClassOverride || null,
    });
    
    // Get WFR credit (NOVA1-2: 1.0, NOVA3: 0.5, NOVA4: 0.0)
    const credit = getWFRCredit(nova);
    wholeCreditKcal += kcal * credit;
  }
  
  const score = calculateWFRPoints(wholeCreditKcal, totalKcal);
  const ratio = totalKcal > 0 ? wholeCreditKcal / totalKcal : 0;
  
  return {
    score,
    debug: {
      wholeCreditKcal: Math.round(wholeCreditKcal * 100) / 100,
      totalKcal: Math.round(totalKcal * 100) / 100,
      ratio: Math.round(ratio * 1000) / 1000,
    },
  };
}

/**
 * Calculate FP_current (Fiber Progress).
 */
function calculateFP(meals: DailyMealData[]): number {
  const totalFiber = meals.reduce((sum, m) => sum + (m.fiber_g || 0), 0);
  return calculateFPPoints(totalFiber);
}

/**
 * Calculate AS_current (Added Sugar - inverse scoring).
 */
function calculateAS(meals: DailyMealData[]): number {
  const totalAddedSugar = meals.reduce((sum, m) => sum + (m.added_sugar_g || 0), 0);
  const totalKcal = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
  return calculateASPoints(totalAddedSugar, totalKcal);
}

/**
 * Calculate PND_current (Phytonutrient Density - plant colors).
 */
function calculatePND(foods: DailyFoodData[]): { score: number; debug: NDSDebugData['pnd'] } {
  const uniqueColors = countUniquePlantColors(
    foods.map(f => ({
      canonicalName: f.canonicalName,
      brandName: f.brandName,
      category: f.category,
      tags: f.tags,
    }))
  );
  
  const score = calculatePNDPoints(uniqueColors);
  
  return {
    score,
    debug: {
      uniqueColors,
      colorsList: [], // Could be populated for more detailed debug
    },
  };
}

/**
 * Calculate MNC_current (Micronutrient Coverage).
 * 
 * Uses beta nutrient set. Excludes unknown nutrients from denominator.
 */
function calculateMNC(foods: DailyFoodData[]): { score: number; debug: NDSDebugData['mnc'] } {
  // Sum nutrients from all foods
  const totals: Record<string, number> = {};
  const nutrientKeys = [
    'potassium_mg', 'magnesium_mg', 'iron_mg', 'calcium_mg', 'zinc_mg',
    'folate_ug', 'vitamin_a_ug_rae', 'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_b12_ug',
  ];
  
  for (const key of nutrientKeys) {
    totals[key] = 0;
  }
  
  for (const food of foods) {
    if (!food.nutrients) continue;
    for (const key of nutrientKeys) {
      const value = food.nutrients[key as keyof typeof food.nutrients];
      if (typeof value === 'number') {
        totals[key] += value;
      }
    }
  }
  
  // Check which nutrients meet 50% DRI
  let metCount = 0;
  let availableCount = 0;
  const nutrientDetails: Record<string, { value: number; dri: number; met: boolean }> = {};
  
  for (const key of nutrientKeys) {
    const driKey = key as keyof typeof BETA_DRI;
    if (driKey === 'sodium_mg') continue; // Sodium is penalty, not coverage
    
    const dri = BETA_DRI[driKey];
    const value = totals[key];
    
    if (value > 0) {
      availableCount++;
      const met = value >= dri * MNC_MET_THRESHOLD;
      if (met) metCount++;
      
      nutrientDetails[key] = {
        value: Math.round(value * 10) / 10,
        dri,
        met,
      };
    }
  }
  
  const score = calculateMNCPoints(metCount, availableCount);
  const coverage = availableCount > 0 ? metCount / availableCount : 0;
  
  return {
    score,
    debug: {
      metCount,
      availableCount,
      coverage: Math.round(coverage * 1000) / 1000,
      nutrientDetails,
    },
  };
}

/**
 * Calculate OB_current (Omega Balance).
 * 
 * Uses ratio if omega data available, otherwise fallback heuristic.
 */
function calculateOB(foods: DailyFoodData[]): { score: number; debug: NDSDebugData['ob'] } {
  // Sum omega totals
  let omega3Total = 0;
  let omega6Total = 0;
  let hasOmegaData = false;
  
  for (const food of foods) {
    if (typeof food.omega3_g === 'number') {
      omega3Total += food.omega3_g;
      hasOmegaData = true;
    }
    if (typeof food.omega6_g === 'number') {
      omega6Total += food.omega6_g;
      hasOmegaData = true;
    }
  }
  
  let score: number;
  let usedFallback: boolean;
  let ratio: number | null;
  let hasFish = false;
  let plantSourceCount = 0;
  
  if (hasOmegaData && omega6Total > 0) {
    // Use ratio calculation
    usedFallback = false;
    ratio = omega3Total / omega6Total;
    score = calculateOBPointsFromRatio(omega3Total, omega6Total);
  } else {
    // Fallback heuristic
    usedFallback = true;
    ratio = null;
    
    const omegaSources = countOmegaSources(
      foods.map(f => ({
        canonicalName: f.canonicalName,
        brandName: f.brandName,
        category: f.category,
        tags: f.tags,
      }))
    );
    
    hasFish = omegaSources.hasFish;
    plantSourceCount = omegaSources.plantSourceCount;
    score = calculateOBPointsFallback(hasFish, plantSourceCount);
  }
  
  return {
    score,
    debug: {
      omega3Total: Math.round(omega3Total * 100) / 100,
      omega6Total: Math.round(omega6Total * 100) / 100,
      ratio,
      usedFallback,
      hasFish,
      plantSourceCount,
    },
  };
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate daily NDS and all subscores.
 * 
 * Formula: NDS100 = 10 * (0.25*WFR + 0.20*PS + 0.10*PND + 0.10*FP + 0.10*AS + 0.10*MNC + 0.15*OB)
 * Note: Using 0.15 for OB to make weights sum to 1.0
 * 
 * @param meals - All meals logged for the day
 * @param includeDebug - Include detailed debug data (default: false)
 * @returns Daily NDS result
 */
export function calculateDailyNDS(
  meals: DailyMealData[],
  includeDebug = false
): DailyNDSResult {
  // Flatten foods from all meals
  const allFoods = meals.flatMap(m => m.foods);
  
  // Calculate subscores
  const psResult = calculatePS(meals);
  const wfrResult = calculateWFR(allFoods);
  const fp_10 = calculateFP(meals);
  const as_10 = calculateAS(meals);
  const pndResult = calculatePND(allFoods);
  const mncResult = calculateMNC(allFoods);
  const obResult = calculateOB(allFoods);
  
  const subscores: NDSSubscores = {
    wfr_10: wfrResult.score,
    ps_10: psResult.score,
    pnd_10: pndResult.score,
    fp_10,
    as_10,
    mnc_10: mncResult.score,
    ob_10: obResult.score,
  };
  
  // Calculate weighted sum
  const weightedSum = 
    NDS_WEIGHTS.wfr * subscores.wfr_10 +
    NDS_WEIGHTS.ps * subscores.ps_10 +
    NDS_WEIGHTS.pnd * subscores.pnd_10 +
    NDS_WEIGHTS.fp * subscores.fp_10 +
    NDS_WEIGHTS.as * subscores.as_10 +
    NDS_WEIGHTS.mnc * subscores.mnc_10 +
    NDS_WEIGHTS.ob * subscores.ob_10;
  
  // Scale to 0-100 and clamp
  const nds_score_100 = Math.min(100, Math.max(0, Math.round(weightedSum * 10 * 100) / 100));
  
  const result: DailyNDSResult = {
    nds_score_100,
    subscores,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };
  
  // Add debug data if requested
  if (includeDebug) {
    const totalCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const totalProtein = meals.reduce((sum, m) => sum + (m.protein_g || 0), 0);
    const totalFiber = meals.reduce((sum, m) => sum + (m.fiber_g || 0), 0);
    const totalAddedSugar = meals.reduce((sum, m) => sum + (m.added_sugar_g || 0), 0);
    
    result.debug_data = {
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein * 10) / 10,
      totalFiber: Math.round(totalFiber * 10) / 10,
      totalAddedSugar: Math.round(totalAddedSugar * 10) / 10,
      wfr: wfrResult.debug,
      ps: psResult.debug,
      pnd: pndResult.debug,
      mnc: mncResult.debug,
      ob: obResult.debug,
    };
  }
  
  return result;
}

/**
 * Calculate NDS with empty/default values.
 * Used when no meals are logged.
 */
export function getEmptyNDS(): DailyNDSResult {
  return {
    nds_score_100: 50, // Neutral starting point
    subscores: {
      wfr_10: 5,
      ps_10: 5,
      pnd_10: 1, // No plants
      fp_10: 1,  // No fiber
      as_10: 8,  // No added sugar is good
      mnc_10: 0, // No micronutrient data
      ob_10: 2,  // No omega data
    },
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };
}
