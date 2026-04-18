/**
 * Plans — Recommendation Ranking (Phase 2)
 *
 * Locked ranking rule (from the Phase 2 packet):
 *   primary   = projected_meal_nds_impact_on_day (descending — bigger lift wins)
 *   tiebreak1 = calorie distance to target       (ascending  — closer wins)
 *   tiebreak2 = protein_score_10                 (descending — higher wins)
 *   tiebreak3 = food trust rank                  (ascending  — lower/better rank wins)
 *   tiebreak4 = allergen count                   (ascending  — fewer wins)
 *
 * The "food trust rank" mirrors the existing food trust layering
 * (food_objects curated > admin > AI > free-text). Lower rank = higher trust.
 *
 * This ranker is used by:
 *   - POST /api/journal/plans/ai/regenerate-slot  (order alternates)
 *   - future NDS optimizer / substitution flows
 */

import type { PlannedMeal } from './types';

// ============================================================================
// Trust rank
// ============================================================================

/**
 * Map a food trust descriptor to a numeric rank (0 = highest trust). The
 * exact source strings mirror the food trust layering used elsewhere in
 * the codebase; unknown values fall back to the bottom rank so they sort
 * last when used as a tiebreak.
 */
export const FOOD_TRUST_RANK: Record<string, number> = {
  food_object_curated: 0,
  food_object_admin: 1,
  food_object: 2,
  admin_estimate: 3,
  ai_estimate: 4,
  free_text: 5,
};

/**
 * Compute the effective trust rank of a meal by looking at its items.
 * Takes the WORST (highest) rank among items — a single free-text item
 * drags the whole meal down, matching the food trust doctrine.
 */
export function trustRankForMeal(meal: PlannedMeal): number {
  const items = ((meal.payload ?? {}) as { items?: Array<Record<string, unknown>> }).items ?? [];
  if (items.length === 0) return FOOD_TRUST_RANK.free_text;

  let worst = 0;
  for (const item of items) {
    let r: number;
    if (typeof item.food_object_id === 'string' && item.food_object_id.length > 0) {
      r = FOOD_TRUST_RANK.food_object;
    } else if (
      typeof (item as { calories?: unknown }).calories === 'number' ||
      (item as { macros?: unknown }).macros
    ) {
      r = FOOD_TRUST_RANK.admin_estimate;
    } else if (typeof (item as { estimate_note?: unknown }).estimate_note === 'string') {
      r = FOOD_TRUST_RANK.ai_estimate;
    } else {
      r = FOOD_TRUST_RANK.free_text;
    }
    if (r > worst) worst = r;
  }
  return worst;
}

// ============================================================================
// Allergen counting
// ============================================================================

/**
 * Count how many of the user's declared allergens appear in a meal. Case
 * insensitive substring match on item names. Trivially simple on purpose —
 * real allergen resolution lives on food_objects and is a later-phase
 * concern.
 */
export function allergenCountForMeal(
  meal: PlannedMeal,
  userAllergens: readonly string[] | null | undefined,
): number {
  if (!userAllergens || userAllergens.length === 0) return 0;
  const items = ((meal.payload ?? {}) as { items?: Array<{ name?: string }> }).items ?? [];
  const haystacks = items.map((i) => (i.name ?? '').toLowerCase());
  let hits = 0;
  for (const allergen of userAllergens) {
    const needle = allergen.trim().toLowerCase();
    if (!needle) continue;
    if (haystacks.some((h) => h.includes(needle))) hits++;
  }
  return hits;
}

// ============================================================================
// Ranking inputs + scorer
// ============================================================================

export interface CandidateMealInputs {
  /** Candidate meal being ranked. */
  meal: PlannedMeal;
  /**
   * Estimated impact on the projected daily NDS (0-100 scale) if this
   * meal is placed into the slot vs. leaving the slot empty or vs. the
   * current incumbent. Higher = better.
   */
  projected_meal_nds_impact_on_day: number;
  /** Target calories for this slot (null = "no preference"). */
  target_calories: number | null;
  /** User's declared allergens from profile. */
  user_allergens: readonly string[] | null | undefined;
}

export interface ScoredCandidate {
  meal: PlannedMeal;
  score: {
    projected_meal_nds_impact_on_day: number;
    calorie_distance: number;
    protein_score_10: number;
    trust_rank: number;
    allergen_count: number;
  };
}

function mealCalories(meal: PlannedMeal): number {
  const totals = ((meal.payload ?? {}) as { totals?: { calories?: number } }).totals ?? {};
  if (typeof totals.calories === 'number') return totals.calories;
  const derived = meal.meal_derived_data as { meal_calories?: number } | undefined;
  if (derived && typeof derived.meal_calories === 'number') return derived.meal_calories;
  return 0;
}

/**
 * Score + sort candidate meals using the locked ranking rule. Returns a
 * new array; does not mutate the input.
 */
export function rankCandidates(candidates: CandidateMealInputs[]): ScoredCandidate[] {
  const scored: ScoredCandidate[] = candidates.map((c) => {
    const calorie_distance =
      c.target_calories === null
        ? 0
        : Math.abs(mealCalories(c.meal) - c.target_calories);
    return {
      meal: c.meal,
      score: {
        projected_meal_nds_impact_on_day: c.projected_meal_nds_impact_on_day,
        calorie_distance,
        protein_score_10: c.meal.protein_score_10 ?? 0,
        trust_rank: trustRankForMeal(c.meal),
        allergen_count: allergenCountForMeal(c.meal, c.user_allergens),
      },
    };
  });

  scored.sort((a, b) => {
    if (a.score.projected_meal_nds_impact_on_day !== b.score.projected_meal_nds_impact_on_day) {
      return b.score.projected_meal_nds_impact_on_day - a.score.projected_meal_nds_impact_on_day;
    }
    if (a.score.calorie_distance !== b.score.calorie_distance) {
      return a.score.calorie_distance - b.score.calorie_distance;
    }
    if (a.score.protein_score_10 !== b.score.protein_score_10) {
      return b.score.protein_score_10 - a.score.protein_score_10;
    }
    if (a.score.trust_rank !== b.score.trust_rank) {
      return a.score.trust_rank - b.score.trust_rank;
    }
    return a.score.allergen_count - b.score.allergen_count;
  });

  return scored;
}

/**
 * Human-readable rationale for a ranking result. Surfaced in the UI as a
 * single-line explanation next to the top candidate.
 */
export function rationaleForRanking(top: ScoredCandidate): string {
  const parts: string[] = [];
  parts.push(`+${top.score.projected_meal_nds_impact_on_day.toFixed(1)} projected NDS`);
  if (top.score.calorie_distance > 0) {
    parts.push(`${Math.round(top.score.calorie_distance)} kcal from target`);
  }
  if (typeof top.score.protein_score_10 === 'number') {
    parts.push(`PS ${top.score.protein_score_10.toFixed(1)}/10`);
  }
  if (top.score.allergen_count > 0) {
    parts.push(`${top.score.allergen_count} allergen hit(s)`);
  }
  return parts.join(' · ');
}
