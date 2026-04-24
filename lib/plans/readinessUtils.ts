/**
 * Packet 38 — Meal readiness utilities.
 *
 * Readiness is computed deterministically from the grocery items whose
 * `source_planned_meal_ids` include a given planned meal ID. No separate
 * readiness state is stored; it is always derived from grocery check/off
 * state so it stays in sync automatically.
 *
 * Readiness states
 * ----------------
 * ready      All contributing items are covered (bought | have) AND none
 *            are unresolved. Unresolved items (food_object_id null) cannot
 *            certify readiness because their identity is uncertain.
 * partial    Some items are covered, OR all items are covered but at least
 *            one is unresolved (uncertain coverage). An intermediate honest
 *            state that surfaces when the user has made progress but the
 *            meal is not yet fully cleared.
 * missing    No contributing items are covered (all pending/skipped). The
 *            meal has a grocery contribution but nothing has been bought.
 * no_list    The meal has no contributing grocery items — either no list
 *            has been generated for this date yet, or the meal payload has
 *            no ingredient items. Not an error; the user simply hasn't run
 *            generate yet (or the meal has no items to shop for).
 *
 * Client-safe — no server-only imports.
 */

import type { GroceryItem, GroceryItemStatus } from './types';

export type MealReadiness = 'ready' | 'partial' | 'missing' | 'no_list';

export interface MealReadinessResult {
  state: MealReadiness;
  /** Total grocery items contributing to this meal. */
  total: number;
  /** Items with status bought | have. */
  covered: number;
  /** True when ≥1 contributing item is unresolved (food_object_id null). */
  has_unresolved: boolean;
}

const COVERED = new Set<GroceryItemStatus>(['bought', 'have']);

/**
 * Compute the readiness of a single planned meal from a flat list of
 * grocery items. Caller is responsible for providing all items on the list
 * (not just those for this meal); filtering is done here.
 */
export function computeMealReadiness(
  mealId: string,
  items: GroceryItem[],
): MealReadinessResult {
  const contributing = items.filter((it) =>
    it.source_planned_meal_ids.includes(mealId),
  );

  if (contributing.length === 0) {
    return { state: 'no_list', total: 0, covered: 0, has_unresolved: false };
  }

  const covered = contributing.filter((it) => COVERED.has(it.status)).length;
  const has_unresolved = contributing.some((it) => it.food_object_id === null);
  const total = contributing.length;

  let state: MealReadiness;
  if (covered === 0) {
    state = 'missing';
  } else if (covered === total && !has_unresolved) {
    state = 'ready';
  } else {
    state = 'partial';
  }

  return { state, total, covered, has_unresolved };
}

/**
 * Batch-compute readiness for multiple meals from the same item list.
 * Returns a map of mealId → MealReadinessResult.
 */
export function computeReadinessMap(
  mealIds: string[],
  items: GroceryItem[],
): Record<string, MealReadinessResult> {
  const result: Record<string, MealReadinessResult> = {};
  for (const id of mealIds) {
    result[id] = computeMealReadiness(id, items);
  }
  return result;
}
