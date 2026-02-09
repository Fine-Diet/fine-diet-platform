/**
 * NOVA Classification Mapping
 * 
 * NOVA is DERIVED from Fine Diet's internal processing_class.
 * NOVA is never stored as a source of truth - always computed.
 * 
 * Version: nova_mapping_2026-02-08.v1
 */

import type { ProcessingClass, NOVALevel, FoodProcessingData } from './types';
import { CLASSIFIER_VERSION } from './types';

// ============================================================================
// NOVA Mapping Table
// ============================================================================

/**
 * Mapping from Fine Diet processing_class to NOVA level.
 * 
 * NOVA Classification:
 * - NOVA 1: Unprocessed or minimally processed foods
 * - NOVA 2: Processed culinary ingredients
 * - NOVA 3: Processed foods
 * - NOVA 4: Ultra-processed food and drink products
 * 
 * Our simplified mapping:
 * - whole → NOVA 1
 * - minimally_processed → NOVA 2
 * - processed → NOVA 3
 * - ultra_processed → NOVA 4
 */
export const PROCESSING_CLASS_TO_NOVA: Record<ProcessingClass, NOVALevel> = {
  whole: 1,
  minimally_processed: 2,
  processed: 3,
  ultra_processed: 4,
};

export const NOVA_MAPPING_VERSION = 'nova_mapping_2026-02-08.v1';

// ============================================================================
// NOVA Credit for WFR Calculation
// ============================================================================

/**
 * WFR (Whole Food Ratio) credit by NOVA level.
 * 
 * Decision (locked): NOVA3 gets partial credit.
 * - NOVA 1-2: credit = 1.0 (full credit as whole/minimally processed)
 * - NOVA 3: credit = 0.5 (partial credit for processed foods)
 * - NOVA 4: credit = 0.0 (no credit for ultra-processed)
 */
export const NOVA_WFR_CREDIT: Record<NOVALevel, number> = {
  1: 1.0,
  2: 1.0,
  3: 0.5,
  4: 0.0,
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the effective processing class for a food.
 * Returns admin override if present, otherwise heuristic value.
 * 
 * @param food - Food processing data
 * @returns Effective processing class or null if not classified
 */
export function getEffectiveProcessingClass(
  food: Pick<FoodProcessingData, 'processing_class' | 'processing_class_override'>
): ProcessingClass | null {
  // Admin override takes precedence
  if (food.processing_class_override !== null) {
    return food.processing_class_override;
  }
  return food.processing_class;
}

/**
 * Get NOVA level from a food's processing data.
 * NOVA is always derived, never stored as source of truth.
 * 
 * @param food - Food processing data
 * @returns NOVA level (1-4) or null if not classified
 */
export function getNOVA(
  food: Pick<FoodProcessingData, 'processing_class' | 'processing_class_override'>
): NOVALevel | null {
  const effectiveClass = getEffectiveProcessingClass(food);
  if (effectiveClass === null) {
    return null;
  }
  return PROCESSING_CLASS_TO_NOVA[effectiveClass];
}

/**
 * Get WFR credit for a food based on its NOVA level.
 * 
 * @param nova - NOVA level (1-4) or null
 * @returns Credit value (0.0-1.0), defaults to 0.5 if NOVA is null (neutral)
 */
export function getWFRCredit(nova: NOVALevel | null): number {
  if (nova === null) {
    // Unknown classification defaults to neutral (0.5) so score isn't penalized
    // when processing_class data is missing (e.g., unclassified USDA foods)
    return 0.5;
  }
  return NOVA_WFR_CREDIT[nova];
}

/**
 * Get WFR credit directly from food processing data.
 * Convenience function combining getNOVA + getWFRCredit.
 * 
 * @param food - Food processing data
 * @returns Credit value (0.0-1.0)
 */
export function getFoodWFRCredit(
  food: Pick<FoodProcessingData, 'processing_class' | 'processing_class_override'>
): number {
  return getWFRCredit(getNOVA(food));
}

/**
 * Get display label for NOVA level.
 */
export function getNOVALabel(nova: NOVALevel | null): string {
  if (nova === null) return 'Unknown';
  switch (nova) {
    case 1: return 'NOVA 1 - Unprocessed';
    case 2: return 'NOVA 2 - Minimally Processed';
    case 3: return 'NOVA 3 - Processed';
    case 4: return 'NOVA 4 - Ultra-Processed';
  }
}

/**
 * Get display label for processing class.
 */
export function getProcessingClassLabel(pc: ProcessingClass | null): string {
  if (pc === null) return 'Unknown';
  switch (pc) {
    case 'whole': return 'Whole';
    case 'minimally_processed': return 'Minimally Processed';
    case 'processed': return 'Processed';
    case 'ultra_processed': return 'Ultra-Processed';
  }
}

/**
 * Get CSS color class for NOVA level (for UI badges).
 */
export function getNOVAColorClass(nova: NOVALevel | null): string {
  if (nova === null) return 'bg-gray-500';
  switch (nova) {
    case 1: return 'bg-green-500';
    case 2: return 'bg-lime-500';
    case 3: return 'bg-yellow-500';
    case 4: return 'bg-red-500';
  }
}
