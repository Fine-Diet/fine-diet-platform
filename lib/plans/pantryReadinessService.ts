/**
 * Packet C — Pantry Readiness Summary (server-side derivation).
 *
 * Readiness is a DERIVED planning-context layer, never a stored source of
 * truth. It is composed read-only from existing truth:
 *   - the active/current plan (selectCurrentPlan: newest active by created_at)
 *   - the active grocery list for that plan's current scope (read-only; this
 *     module NEVER generates a grocery list)
 *   - the person's pantry_on_hand_items
 *
 * Row-level pantry deduction semantics remain owned by groceryReadModel.ts.
 * This module only buckets each row's read-model output into summary counts,
 * so "Required amount stays primary / deduction only on safe identity + unit"
 * is preserved exactly.
 */

import { getPlanDetail, listPlansForPerson } from './planServerService';
import { selectCurrentPlan } from './currentPlan';
import {
  listPantryOnHandItems,
  selectActiveGroceryList,
} from './groceryServerService';
import { buildGroceryItemReadModel } from './groceryReadModel';
import type {
  GroceryItem,
  PantryOnHandItem,
  PantryReadinessCoverage,
  PantryReadinessSummary,
} from './types';

/**
 * Mirrors the Plans page grocery link scope (first plan day → up to +6 days)
 * so the readiness summary points at the same list Plans/Grocery would.
 */
const MAX_SCOPE_DAY_INDEX = 6;

function deriveGroceryScope(
  dayDates: string[],
): { date_start: string; date_end: string } | null {
  if (dayDates.length === 0) return null;
  const ordered = [...dayDates].sort((a, b) => a.localeCompare(b));
  const start = ordered[0]!;
  const end = ordered[Math.min(ordered.length - 1, MAX_SCOPE_DAY_INDEX)]!;
  return { date_start: start, date_end: end };
}

function aggregateCoverage(
  items: GroceryItem[],
  pantryItems: PantryOnHandItem[],
): PantryReadinessCoverage {
  let coveredFull = 0;
  let partial = 0;
  let toBuy = 0;
  let unresolvedIdentity = 0;
  let unitOrAmountReview = 0;

  for (const item of items) {
    const rm = buildGroceryItemReadModel(item, pantryItems);

    // Unresolved canonical identity can never deduct from pantry.
    if (!item.food_object_id) {
      unresolvedIdentity += 1;
      continue;
    }

    // A pantry row exists but cannot deduct safely (unit mismatch or
    // missing amounts) — review-oriented, not a fake deduction.
    if (rm.onHand && rm.stillToBuy.state === 'unsafe') {
      unitOrAmountReview += 1;
      continue;
    }

    // Safe identity + unit match with a pantry row.
    if (rm.onHand && rm.stillToBuy.state === 'safe') {
      if ((rm.stillToBuy.quantity ?? 0) <= 0) {
        coveredFull += 1;
      } else {
        partial += 1;
      }
      continue;
    }

    // Resolved row with no usable pantry coverage — still to buy.
    toBuy += 1;
  }

  return {
    rows_total: items.length,
    rows_safe_match: coveredFull + partial,
    rows_covered_full: coveredFull,
    rows_partial: partial,
    rows_to_buy: toBuy,
    rows_unresolved_identity: unresolvedIdentity,
    rows_unit_or_amount_review: unitOrAmountReview,
  };
}

/**
 * Compose the Pantry Readiness Summary for the authenticated person. All
 * reads are person-scoped by the underlying services; nothing is persisted.
 */
export async function getPantryReadiness(
  personId: string,
): Promise<PantryReadinessSummary> {
  const [plans, pantryItems] = await Promise.all([
    listPlansForPerson(personId),
    listPantryOnHandItems(personId),
  ]);
  const pantryItemsSaved = pantryItems.length;

  const activePlan = selectCurrentPlan(plans);
  if (!activePlan) {
    return {
      state: 'no_plan',
      pantry_items_saved: pantryItemsSaved,
      active_plan: null,
      grocery_scope: null,
      list_context: null,
      coverage: null,
    };
  }

  const planRef = { id: activePlan.id, title: activePlan.title };

  const detail = await getPlanDetail(personId, activePlan.id);
  const scope = deriveGroceryScope((detail?.days ?? []).map((d) => d.date_local));
  if (!scope) {
    return {
      state: 'no_grocery_list',
      pantry_items_saved: pantryItemsSaved,
      active_plan: planRef,
      grocery_scope: null,
      list_context: null,
      coverage: null,
    };
  }

  const active = await selectActiveGroceryList({
    personId,
    planId: activePlan.id,
    dateStart: scope.date_start,
    dateEnd: scope.date_end,
  });
  if (!active) {
    // Plan exists but no grocery list covers the current scope. Surface the
    // requested scope so the UI can link straight to where it would generate.
    return {
      state: 'no_grocery_list',
      pantry_items_saved: pantryItemsSaved,
      active_plan: planRef,
      grocery_scope: scope,
      list_context: null,
      coverage: null,
    };
  }

  const coverage = aggregateCoverage(active.items, pantryItems);
  return {
    state: pantryItemsSaved === 0 ? 'no_pantry' : 'has_grocery',
    pantry_items_saved: pantryItemsSaved,
    active_plan: planRef,
    grocery_scope: {
      date_start: active.context.active_date_start,
      date_end: active.context.active_date_end,
    },
    list_context: active.context,
    coverage,
  };
}
