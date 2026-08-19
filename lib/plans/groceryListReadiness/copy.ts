/**
 * Truthful Grocery/List readiness and shopping-status copy.
 * Never implies priced/retailer/Haul/Pantry-committed truth.
 */

import type { GroceryItemStatus } from '@/lib/plans/types';
import type {
  GroceryListReadinessCounts,
  GroceryListReadinessDecision,
  GroceryListReadinessState,
} from './policy';

export const GROCERY_SHOPPING_STATUS_LABELS: Record<GroceryItemStatus, string> = {
  pending: 'Need to buy',
  bought: 'Bought',
  have: 'Already have',
  skipped: 'Skipped',
};

export function formatGroceryShoppingStatusLabel(status: GroceryItemStatus): string {
  return GROCERY_SHOPPING_STATUS_LABELS[status];
}

function remainingPhrase(counts: GroceryListReadinessCounts): string {
  const n = counts.pending;
  return `${n} item${n === 1 ? '' : 's'} remain`;
}

function resolutionPhrase(counts: GroceryListReadinessCounts): string {
  const identity = counts.pendingUnresolvedIdentity;
  const amount = counts.pendingUnsafeAmount;
  if (identity > 0 && amount > 0 && identity !== amount) {
    return `${identity} item${identity === 1 ? '' : 's'} still need ingredient identity and ${amount} need a required amount before reliable shopping support.`;
  }
  if (identity > 0) {
    return `${identity} item${identity === 1 ? '' : 's'} still need ingredient identity before reliable shopping support.`;
  }
  return `${amount} item${amount === 1 ? '' : 's'} still need a required amount before reliable shopping support.`;
}

export function formatGroceryListReadinessCopy(
  decision: GroceryListReadinessDecision,
): string {
  switch (decision.state) {
    case 'empty_or_no_demand':
      return 'Nothing on this list yet.';
    case 'needs_resolution':
      return resolutionPhrase(decision.counts);
    case 'ready_to_shop':
      return `${remainingPhrase(decision.counts)} pending. Pricing is optional.`;
    case 'shopping_in_progress':
      // Packet 11E: neutral list-facing language — "in progress" rather than
      // "Shopping in progress", because Shopping belongs conceptually to Hauls.
      return `${remainingPhrase(decision.counts)} still on the list.`;
    case 'complete_or_closed':
      return 'Nothing left on this list.';
  }
}

export function groceryListReadinessHeadline(state: GroceryListReadinessState): string {
  switch (state) {
    case 'empty_or_no_demand':
      return 'No items yet';
    case 'needs_resolution':
      return 'Needs attention';
    case 'ready_to_shop':
      return 'Ready to shop';
    case 'shopping_in_progress':
      // Packet 11E: do not make "Shopping in progress" the dominant List headline.
      return 'In progress';
    case 'complete_or_closed':
      return 'List complete';
  }
}

// ============================================================================
// Packet 11E — Groceries landing copy
// ============================================================================

export const GROCERIES_INDEX_TITLE = 'Groceries';
export const GROCERIES_INDEX_SUPPORTING_COPY =
  'Keep track of what you need, then build a Haul when you\'re ready to shop.';
export const GROCERIES_INDEX_OTHER_LISTS_HEADING = 'Other Lists';

export const GROCERIES_LISTS_SECTION_HEADING = 'Grocery Lists';
export const GROCERIES_LISTS_SECTION_COPY = 'Ongoing lists of what you need.';

export const GROCERIES_HAULS_SECTION_HEADING = 'Hauls';
export const GROCERIES_HAULS_SECTION_COPY = 'What you\'re buying, when, and eventually where.';

export const GROCERIES_HAULS_EMPTY =
  'No Hauls yet. When a Grocery List is ready, build a Haul to prepare for shopping.';

export const HAULS_INDEX_TITLE = 'Hauls';
export const HAULS_INDEX_SUPPORTING_COPY = 'Execution history — every shopping occasion you\'ve prepared.';

/**
 * Packet 11E — List-card open action always routes to the Grocery List.
 * `shopping_in_progress` is list-status only; it does not imply a Haul.
 */
export function groceryListReadinessIndexCtaLabel(state: GroceryListReadinessState): string {
  switch (state) {
    case 'empty_or_no_demand':
      return 'Open List';
    case 'needs_resolution':
      return 'Open List';
    case 'ready_to_shop':
      return 'Open List';
    case 'shopping_in_progress':
      return 'Open List';
    case 'complete_or_closed':
      return 'Open List';
  }
}

export const GROCERY_LIST_PRICING_SECONDARY_LABEL = 'Pricing & estimates (optional)';
// Packet 11E narrow copy correction: "List estimate" avoids collision with
// canonical Haul execution language. Internal types remain unchanged.
export const GROCERY_LIST_HAUL_ESTIMATE_BOUNDARY =
  'List estimate is optional cost support. It is not a dated Haul, store assignment, or execution record.';
export const GROCERY_LIST_PULL_FROM_PLAN_TITLE = 'Add plan demand to this list';
export const GROCERY_LIST_PULL_FROM_PLAN_HELP =
  'Adds this plan’s pending needs into this list. It does not build or reuse the canonical Plan Week grocery list.';
export const GROCERY_LIST_PLAN_SCOPED_ADD_HOLD =
  'This list was generated from your plan. Extra items belong on a personal grocery list so plan regeneration cannot overwrite them.';
