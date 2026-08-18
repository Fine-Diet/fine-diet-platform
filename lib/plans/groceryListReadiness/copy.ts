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
      return 'Nothing to shop yet on this list.';
    case 'needs_resolution':
      return resolutionPhrase(decision.counts);
    case 'ready_to_shop':
      return `Ready to shop — ${remainingPhrase(decision.counts)}. Pricing is optional.`;
    case 'shopping_in_progress':
      return `Shopping in progress — ${remainingPhrase(decision.counts)}. Pricing is optional.`;
    case 'complete_or_closed':
      return 'Nothing left to buy on this list.';
  }
}

export function groceryListReadinessHeadline(state: GroceryListReadinessState): string {
  switch (state) {
    case 'empty_or_no_demand':
      return 'No demand yet';
    case 'needs_resolution':
      return 'Needs resolution';
    case 'ready_to_shop':
      return 'Ready to shop';
    case 'shopping_in_progress':
      return 'Shopping in progress';
    case 'complete_or_closed':
      return 'List complete';
  }
}

export const GROCERIES_INDEX_TITLE = 'Groceries';
export const GROCERIES_INDEX_SUPPORTING_COPY =
  'Keep track of what you need. When a list is ready, start a shopping trip.';
export const GROCERIES_INDEX_PROGRESSION = 'List → Ready to shop → Shopping trip';
export const GROCERIES_INDEX_OTHER_LISTS_HEADING = 'Other lists';

/**
 * Groceries index CTAs. Every label routes to Grocery List detail — never a
 * Haul. `shopping_in_progress` is list-status language only and does not
 * imply an open canonical Haul.
 */
export function groceryListReadinessIndexCtaLabel(state: GroceryListReadinessState): string {
  switch (state) {
    case 'empty_or_no_demand':
      return 'Add items';
    case 'needs_resolution':
      return 'Resolve list';
    case 'ready_to_shop':
      return 'Review & start shopping';
    case 'shopping_in_progress':
      return 'Open list';
    case 'complete_or_closed':
      return 'Review list';
  }
}

export const GROCERY_LIST_PRICING_SECONDARY_LABEL = 'Pricing & estimates (optional)';
export const GROCERY_LIST_HAUL_ESTIMATE_BOUNDARY =
  'Full Haul Estimate is optional cost support. It is not a dated shopping trip, store assignment, or Haul record.';
export const GROCERY_LIST_PULL_FROM_PLAN_TITLE = 'Add plan demand to this list';
export const GROCERY_LIST_PULL_FROM_PLAN_HELP =
  'Adds this plan’s pending needs into this list. It does not build or reuse the canonical Plan Week grocery list.';
export const GROCERY_LIST_PLAN_SCOPED_ADD_HOLD =
  'This list was generated from your plan. Extra items belong on a personal grocery list so plan regeneration cannot overwrite them.';
