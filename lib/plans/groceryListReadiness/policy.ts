/**
 * Packet 10 — Grocery/List shopping readiness.
 *
 * Deterministic, explainable decision over persisted list truth only.
 * Pricing, retailer scenarios, Full Haul Estimate, and Pantry coverage
 * never classify a list. A list can be ready_to_shop with zero prices.
 */

import type { GroceryItem, GroceryItemStatus } from '@/lib/plans/types';

export const GROCERY_LIST_READINESS_POLICY_ID = 'grocery-list-readiness.v1' as const;
export const GROCERY_LIST_READINESS_POLICY_VERSION = 'v1' as const;

export type GroceryListReadinessState =
  | 'empty_or_no_demand'
  | 'needs_resolution'
  | 'ready_to_shop'
  | 'shopping_in_progress'
  | 'complete_or_closed';

export type GroceryListReadinessReasonCode =
  | 'empty_list'
  | 'unresolved_identity'
  | 'unsafe_amount'
  | 'pending_items_remain'
  | 'explicit_shopping_progress'
  | 'nothing_pending'
  | 'pricing_optional'
  | 'pricing_absent'
  | 'pricing_partial'
  | 'pricing_stale'
  | 'pantry_presentation_only';

export interface GroceryListReadinessCounts {
  total: number;
  pending: number;
  bought: number;
  have: number;
  skipped: number;
  pendingUnresolvedIdentity: number;
  pendingUnsafeAmount: number;
}

export interface GroceryListReadinessDecision {
  policyId: typeof GROCERY_LIST_READINESS_POLICY_ID;
  policyVersion: typeof GROCERY_LIST_READINESS_POLICY_VERSION;
  state: GroceryListReadinessState;
  reasonCodes: GroceryListReadinessReasonCode[];
  counts: GroceryListReadinessCounts;
}

export type GroceryListReadinessItem = Pick<
  GroceryItem,
  'status' | 'food_object_id' | 'quantity'
>;

const CLOSED_STATUSES = new Set<GroceryItemStatus>(['bought', 'have', 'skipped']);

function countByStatus(
  items: GroceryListReadinessItem[],
  status: GroceryItemStatus,
): number {
  return items.filter((item) => item.status === status).length;
}

export function groceryListReadinessCounts(
  items: GroceryListReadinessItem[],
): GroceryListReadinessCounts {
  const pendingItems = items.filter((item) => item.status === 'pending');
  return {
    total: items.length,
    pending: pendingItems.length,
    bought: countByStatus(items, 'bought'),
    have: countByStatus(items, 'have'),
    skipped: countByStatus(items, 'skipped'),
    pendingUnresolvedIdentity: pendingItems.filter((item) => !item.food_object_id).length,
    pendingUnsafeAmount: pendingItems.filter((item) => item.quantity == null).length,
  };
}

function pricingReasonCodes(args: {
  pricedItemCount: number;
  stalePriceCount: number;
  eligibleCount: number;
}): GroceryListReadinessReasonCode[] {
  const codes: GroceryListReadinessReasonCode[] = ['pricing_optional'];
  if (args.eligibleCount <= 0 || args.pricedItemCount <= 0) {
    codes.push('pricing_absent');
  } else if (args.pricedItemCount < args.eligibleCount) {
    codes.push('pricing_partial');
  }
  if (args.stalePriceCount > 0) codes.push('pricing_stale');
  return codes;
}

/**
 * Classify a grocery list for human shopping. `pricedItemCount` / `stalePriceCount`
 * are observational only — they never change `state`.
 */
export function evaluateGroceryListReadiness(args: {
  items: GroceryListReadinessItem[];
  pricedItemCount?: number;
  stalePriceCount?: number;
}): GroceryListReadinessDecision {
  const counts = groceryListReadinessCounts(args.items);
  const pricedItemCount = args.pricedItemCount ?? 0;
  const stalePriceCount = args.stalePriceCount ?? 0;
  const pricingCodes = pricingReasonCodes({
    pricedItemCount,
    stalePriceCount,
    eligibleCount: counts.total,
  });
  const shared = {
    policyId: GROCERY_LIST_READINESS_POLICY_ID,
    policyVersion: GROCERY_LIST_READINESS_POLICY_VERSION,
    counts,
  } as const;

  if (counts.total === 0) {
    return {
      ...shared,
      state: 'empty_or_no_demand',
      reasonCodes: ['empty_list', ...pricingCodes, 'pantry_presentation_only'],
    };
  }

  if (counts.pending === 0) {
    return {
      ...shared,
      state: 'complete_or_closed',
      reasonCodes: ['nothing_pending', ...pricingCodes, 'pantry_presentation_only'],
    };
  }

  const resolutionCodes: GroceryListReadinessReasonCode[] = [];
  if (counts.pendingUnresolvedIdentity > 0) resolutionCodes.push('unresolved_identity');
  if (counts.pendingUnsafeAmount > 0) resolutionCodes.push('unsafe_amount');
  if (resolutionCodes.length > 0) {
    return {
      ...shared,
      state: 'needs_resolution',
      reasonCodes: [
        ...resolutionCodes,
        'pending_items_remain',
        ...pricingCodes,
        'pantry_presentation_only',
      ],
    };
  }

  const progressCount = counts.bought + counts.have + counts.skipped;
  if (progressCount > 0) {
    return {
      ...shared,
      state: 'shopping_in_progress',
      reasonCodes: [
        'explicit_shopping_progress',
        'pending_items_remain',
        ...pricingCodes,
        'pantry_presentation_only',
      ],
    };
  }

  return {
    ...shared,
    state: 'ready_to_shop',
    reasonCodes: ['pending_items_remain', ...pricingCodes, 'pantry_presentation_only'],
  };
}

export function isClosedShoppingStatus(status: GroceryItemStatus): boolean {
  return CLOSED_STATUSES.has(status);
}
