/**
 * Meal-Level Derived Computations
 * 
 * Computes protein_score_10, is_main_meal, and PSQ on meal log mutation.
 * These are computed synchronously when a meal is logged/updated.
 */

import type { 
  MealDerivedData, 
  ProteinSourceQuality,
  ProcessingClass 
} from './types';
import { 
  MAIN_MEAL_KCAL_THRESHOLD, 
  PSQ_MULTIPLIERS 
} from './types';
import { calculateMealProteinScore } from './tiers';
import { getEffectiveProcessingClass, getNOVA } from './novaMapping';
import { containsProteinPowder, isProteinBarOrRTD } from './processingClassifier';

// ============================================================================
// Types
// ============================================================================

/**
 * Food item data needed for meal computation.
 */
export interface MealFoodItem {
  /** Unique ID of the food item */
  id?: string;
  /** Canonical name of the food */
  canonicalName: string;
  /** Brand name (optional) */
  brandName?: string | null;
  /** Calories contributed by this item */
  calories: number;
  /** Protein grams contributed by this item */
  proteinG: number;
  /** Processing classification (from food_objects) */
  processingClass?: ProcessingClass | null;
  /** Admin override of processing class */
  processingClassOverride?: ProcessingClass | null;
  /** Food category */
  category?: string | null;
  /** Food tags */
  tags?: string[];
}

/**
 * Result of PSQ analysis for a meal.
 */
export interface PSQAnalysis {
  /** Final PSQ quality category */
  quality: ProteinSourceQuality;
  /** Multiplier value (0.7-1.0) */
  multiplier: number;
  /** Breakdown for debugging */
  breakdown: {
    totalProteinG: number;
    wholeProteinG: number;
    powderProteinG: number;
    upfProteinG: number;
    wholeRatio: number;
    powderRatio: number;
    upfRatio: number;
  };
}

// ============================================================================
// PSQ (Protein Source Quality) Calculation
// ============================================================================

/**
 * Analyze protein source quality for a meal.
 * 
 * PSQ Categories:
 * - whole_dominant: Mostly whole/minimally processed (>=70% of protein) → 1.0
 * - mixed_whole_powder: Mix of whole + powder → 0.9
 * - powder_dominant: Powder-dominant (>=50% from powder) → 0.8
 * - upf_dominant: Ultra-processed protein dominant (>=50% from UPF) → 0.7
 */
export function analyzePSQ(foods: MealFoodItem[]): PSQAnalysis {
  let totalProteinG = 0;
  let wholeProteinG = 0;      // From whole/minimally processed
  let powderProteinG = 0;     // From protein powders
  let upfProteinG = 0;        // From ultra-processed foods
  
  for (const food of foods) {
    const protein = food.proteinG || 0;
    totalProteinG += protein;
    
    // Check for protein powder
    const isPowder = containsProteinPowder({
      canonical_name: food.canonicalName,
      brand_name: food.brandName,
      category: food.category,
      tags: food.tags,
    });
    
    // Check for protein bar/RTD
    const isBarOrRTD = isProteinBarOrRTD({
      canonical_name: food.canonicalName,
      brand_name: food.brandName,
      category: food.category,
      tags: food.tags,
    });
    
    // Get NOVA level from processing class
    const nova = getNOVA({
      processing_class: food.processingClass || null,
      processing_class_override: food.processingClassOverride || null,
    });
    
    // Categorize protein contribution
    if (isPowder) {
      powderProteinG += protein;
    } else if (isBarOrRTD || nova === 4) {
      upfProteinG += protein;
    } else if (nova === 1 || nova === 2 || nova === null) {
      // NOVA 1-2 or unclassified (assume whole)
      wholeProteinG += protein;
    } else if (nova === 3) {
      // NOVA 3 (processed) - split credit
      wholeProteinG += protein * 0.5;
      upfProteinG += protein * 0.5;
    }
  }
  
  // Calculate ratios
  const wholeRatio = totalProteinG > 0 ? wholeProteinG / totalProteinG : 1;
  const powderRatio = totalProteinG > 0 ? powderProteinG / totalProteinG : 0;
  const upfRatio = totalProteinG > 0 ? upfProteinG / totalProteinG : 0;
  
  // Determine quality category
  let quality: ProteinSourceQuality;
  
  if (upfRatio >= 0.5) {
    quality = 'upf_dominant';
  } else if (powderRatio >= 0.5) {
    quality = 'powder_dominant';
  } else if (powderRatio > 0.1 && wholeRatio >= 0.4) {
    quality = 'mixed_whole_powder';
  } else if (wholeRatio >= 0.7) {
    quality = 'whole_dominant';
  } else {
    // Mixed without clear dominance - use mixed category
    quality = 'mixed_whole_powder';
  }
  
  return {
    quality,
    multiplier: PSQ_MULTIPLIERS[quality],
    breakdown: {
      totalProteinG: Math.round(totalProteinG * 10) / 10,
      wholeProteinG: Math.round(wholeProteinG * 10) / 10,
      powderProteinG: Math.round(powderProteinG * 10) / 10,
      upfProteinG: Math.round(upfProteinG * 10) / 10,
      wholeRatio: Math.round(wholeRatio * 100) / 100,
      powderRatio: Math.round(powderRatio * 100) / 100,
      upfRatio: Math.round(upfRatio * 100) / 100,
    },
  };
}

// ============================================================================
// Main Meal Computation
// ============================================================================

/**
 * Compute derived data for a meal.
 * Called synchronously on meal create/update.
 * 
 * @param foods - Food items in the meal
 * @returns Meal derived data including protein_score_10 and is_main_meal
 */
export function computeMealDerivedData(foods: MealFoodItem[]): MealDerivedData {
  // Sum totals
  let mealCalories = 0;
  let mealProteinG = 0;
  
  for (const food of foods) {
    mealCalories += food.calories || 0;
    mealProteinG += food.proteinG || 0;
  }
  
  // Determine if main meal (>=250 kcal)
  const isMainMeal = mealCalories >= MAIN_MEAL_KCAL_THRESHOLD;
  
  // Analyze PSQ
  const psqAnalysis = analyzePSQ(foods);
  
  // Calculate protein score
  const proteinScore10 = calculateMealProteinScore(
    mealProteinG,
    mealCalories,
    psqAnalysis.multiplier
  );
  
  return {
    protein_score_10: proteinScore10,
    is_main_meal: isMainMeal,
    meal_calories: Math.round(mealCalories),
    meal_protein_g: Math.round(mealProteinG * 10) / 10,
    psq_multiplier: psqAnalysis.multiplier,
  };
}

/**
 * Compute meal derived data from journal entry payload.
 * Simplified version when full food objects aren't available.
 * 
 * @param payload - Journal entry payload
 * @returns Partial meal derived data
 */
export function computeMealDerivedFromPayload(payload: {
  calories?: number;
  macros?: { protein?: number };
  name?: string;
}): MealDerivedData {
  const mealCalories = payload.calories || 0;
  const mealProteinG = payload.macros?.protein || 0;
  const isMainMeal = mealCalories >= MAIN_MEAL_KCAL_THRESHOLD;
  
  // Without full food data, assume whole food quality (PSQ = 1.0)
  // This is a fallback for entries without linked food objects
  const psqMultiplier = 1.0;
  
  const proteinScore10 = calculateMealProteinScore(
    mealProteinG,
    mealCalories,
    psqMultiplier
  );
  
  return {
    protein_score_10: proteinScore10,
    is_main_meal: isMainMeal,
    meal_calories: Math.round(mealCalories),
    meal_protein_g: Math.round(mealProteinG * 10) / 10,
    psq_multiplier: psqMultiplier,
  };
}
