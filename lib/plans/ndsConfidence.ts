/**
 * Plans — NDS Confidence Mapping (Phase 2)
 *
 * Plans-only heuristic that converts "how well did we resolve this meal"
 * into the three-bucket NDSConfidence signal used across planned_meals,
 * imported_meals, planned_substitutions, and the projected-day rollup.
 *
 * Locked rule for Phase 2 (from the packet constraints):
 *   - high   when EVERY meal item resolves to a food_objects row with real
 *            nutrient coverage.
 *   - medium when SOME items are admin or curated estimates (have
 *            macros/calories but no food_object_id, or are known-good
 *            curated estimates without full nutrient profiles).
 *   - low    when ANY item is AI-estimated or free-text.
 *
 * This file does NOT touch lib/nds/* and never alters NDS math. It is
 * purely a presentation / rationale signal.
 */

import type { NDSConfidence } from './types';
import type { PlannedMeal } from './types';

/**
 * Coverage breakdown for a single meal. All counts are item-level.
 */
export interface MealCoverage {
  /** Items with a non-null food_object_id — real resolved foods. */
  resolved_items: number;
  /** Items that have at least calories + one macro but no food_object_id. */
  estimate_items: number;
  /** Items that are AI-estimated or pure free-text (no macros + no FK). */
  ai_or_text_items: number;
  /** Total items. */
  total_items: number;
}

/**
 * Shape of a single item in PlannedMealPayload.items. Kept loose here on
 * purpose — this module must accept anything the validators/DB will allow.
 */
interface LooseMealItem {
  food_object_id?: string | null;
  calories?: number | null;
  macros?: {
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  } | null;
  estimate_note?: string | null;
}

function itemHasMacros(item: LooseMealItem): boolean {
  if (typeof item.calories === 'number' && item.calories > 0) return true;
  const m = item.macros;
  if (!m) return false;
  const anyMacro =
    (typeof m.protein === 'number' && m.protein > 0) ||
    (typeof m.carbs === 'number' && m.carbs > 0) ||
    (typeof m.fat === 'number' && m.fat > 0);
  return anyMacro;
}

/**
 * Bucket the items of a planned/imported meal payload into coverage counts.
 */
export function coverageForMealItems(items: LooseMealItem[]): MealCoverage {
  let resolved = 0;
  let estimate = 0;
  let ai_or_text = 0;

  for (const item of items) {
    if (item.food_object_id) {
      resolved++;
      continue;
    }
    if (itemHasMacros(item)) {
      estimate++;
      continue;
    }
    ai_or_text++;
  }

  return {
    resolved_items: resolved,
    estimate_items: estimate,
    ai_or_text_items: ai_or_text,
    total_items: items.length,
  };
}

/**
 * Map meal coverage to a single NDSConfidence bucket. Conservative: if no
 * items at all, returns 'low' — there is nothing to stand behind.
 */
export function confidenceForCoverage(coverage: MealCoverage): NDSConfidence {
  if (coverage.total_items === 0) return 'low';
  if (coverage.ai_or_text_items > 0) return 'low';
  if (coverage.estimate_items > 0) return 'medium';
  return 'high';
}

/**
 * Convenience: compute NDSConfidence directly from meal items.
 */
export function confidenceForMealItems(items: LooseMealItem[]): NDSConfidence {
  return confidenceForCoverage(coverageForMealItems(items));
}

/**
 * Roll individual meal confidences up to a per-day projection confidence.
 *
 * Locked Phase 2 rule mirrors the per-meal rule: the day is only as strong
 * as its weakest meal. Any low → low. Any medium (with no low) → medium.
 * All high → high. No meals → low (nothing to project).
 */
export function confidenceForDay(mealConfidences: NDSConfidence[]): NDSConfidence {
  if (mealConfidences.length === 0) return 'low';
  if (mealConfidences.some((c) => c === 'low')) return 'low';
  if (mealConfidences.some((c) => c === 'medium')) return 'medium';
  return 'high';
}

/**
 * Compute projection confidence for a set of planned meals on one day.
 * Exists as a single call site so server, API, and UI all agree.
 */
export function projectionConfidenceForPlannedMeals(
  meals: Pick<PlannedMeal, 'nds_confidence'>[],
): NDSConfidence {
  return confidenceForDay(meals.map((m) => m.nds_confidence));
}
