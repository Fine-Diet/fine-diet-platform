/**
 * Package 3 — Honest MealDocument nutrition status derivation.
 *
 * Distinguishes calculated / imported / user_entered / unavailable / stale /
 * unknown. Never fabricates precision: when signals conflict or are missing,
 * returns 'unknown' or 'unavailable' rather than inventing a status.
 */

import type {
  MealComponent,
  MealDocument,
  MealNutrition,
  MealNutritionStatus,
} from './types';

function hasNutritionValues(n: MealNutrition | null | undefined): boolean {
  if (!n) return false;
  const m = n.macros;
  return (
    n.calories != null ||
    m.protein_g != null ||
    m.carbs_g != null ||
    m.fat_g != null ||
    m.fiber_g != null ||
    m.added_sugar_g != null
  );
}

function componentSourceKinds(components: MealComponent[]): Set<MealComponent['source_kind']> {
  return new Set(components.map((c) => c.source_kind));
}

/**
 * Derive an honest nutrition_status from a MealDocument's current fields.
 * Prefer an explicit document.nutrition_status when present and valid;
 * otherwise derive from components + review + source.
 */
export function deriveMealNutritionStatus(doc: MealDocument): MealNutritionStatus {
  // Explicit stamp wins — but only when set by a prior honest derivation/write.
  if (doc.nutrition_status != null) return doc.nutrition_status;

  const hasRolledUp =
    hasNutritionValues(doc.per_serving) || hasNutritionValues(doc.totals);
  const anyNeedsReview =
    doc.review_state === 'needs_review' ||
    doc.components.some((c) => c.needs_review);

  if (!hasRolledUp) return 'unavailable';

  if (anyNeedsReview) {
    // Had numbers but grounding/yield is incomplete — treat as stale rather
    // than calculated, so consumers do not over-trust.
    return 'stale';
  }

  const components = doc.components ?? [];
  if (components.length === 0) {
    // Rolled-up numbers with no component lineage cannot be classified precisely.
    return 'unknown';
  }

  const allMatchedFood = components.every(
    (c) => c.source_kind === 'food_object' && c.match_status === 'matched',
  );
  if (allMatchedFood) return 'calculated';

  const allUserEntered = components.every((c) => c.source_kind === 'user_entered');
  if (allUserEntered) return 'user_entered';

  const importedSource =
    doc.source?.source_type === 'imported' ||
    doc.source?.source_type === 'url' ||
    doc.source?.source_type === 'video' ||
    doc.source?.source_imported_meal_id != null;

  if (importedSource) {
    return 'imported';
  }

  const kinds = componentSourceKinds(components);
  if (kinds.has('food_object') && !kinds.has('heuristic_guess') && !kinds.has('default_guess')) {
    return 'calculated';
  }

  return 'unknown';
}

/**
 * Stamp nutrition_status onto a document copy. Pure; does not mutate input.
 */
export function withDerivedNutritionStatus(doc: MealDocument): MealDocument {
  return {
    ...doc,
    nutrition_status: deriveMealNutritionStatus(doc),
  };
}
