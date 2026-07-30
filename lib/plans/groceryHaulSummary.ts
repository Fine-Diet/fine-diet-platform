/**
 * Deterministic grocery haul summary from confirmed observations.
 * Delegates Full Haul Estimate + segment attribution to the pure read model.
 */

import type { FullHaulEstimate, FullHaulTaxContext, GroceryHaulSummary } from './groceryPricingTypes';
import type { GroceryItem } from './types';
import type { GroceryListScope } from './groceryShoppingOverrideStore';
import { listCurrentObservationsForScope } from './groceryPriceStore';
import { computeFullHaulEstimate } from './fullHaulEstimate';

export type BuildGroceryHaulSummaryOptions = {
  personId: string;
  groceryListId: string;
  scope: GroceryListScope;
  items: GroceryItem[];
  /** Optional list plan id for plan-scoped provenance fallback. */
  listPlanId?: string | null;
  planLabels?: Record<string, string>;
  tax?: FullHaulTaxContext | null;
};

export function groceryHaulSummaryFromFullHaul(fullHaul: FullHaulEstimate): GroceryHaulSummary {
  return {
    grocery_list_id: fullHaul.grocery_list_id,
    currency: fullHaul.currency,
    // Stage-1 headline remains merchandise-only when tax is excluded/incomplete,
    // and merchandise+tax when tax is estimated — matching Full Haul total.
    estimated_total: fullHaul.estimated_total,
    manual_subtotal: fullHaul.observation_manual_subtotal,
    sourced_subtotal: fullHaul.observation_sourced_subtotal,
    priced_item_count: fullHaul.priced_item_count,
    eligible_item_count: fullHaul.eligible_item_count,
    total_item_count: fullHaul.eligible_item_count,
    unpriced_item_count: fullHaul.unpriced_item_count,
    priced_coverage_percent: fullHaul.priced_coverage_percent,
    stale_item_count: fullHaul.stale_item_count,
    average_match_confidence: fullHaul.average_match_confidence,
    newest_price_at: fullHaul.newest_price_at,
    oldest_price_at: fullHaul.oldest_price_at,
    is_incomplete_estimate: fullHaul.is_incomplete_estimate,
    confidence_summary: fullHaul.estimate_confidence,
    estimated_merchandise_subtotal: fullHaul.estimated_merchandise_subtotal,
    estimated_tax: fullHaul.estimated_tax,
    tax_status: fullHaul.tax_status,
    tax_disclosure: fullHaul.tax_disclosure,
  };
}

export async function buildGroceryHaulSummary(
  options: BuildGroceryHaulSummaryOptions,
): Promise<GroceryHaulSummary> {
  const result = await buildGroceryHaulSummaryWithFullHaul(options);
  return result.summary;
}

export async function buildGroceryHaulSummaryWithFullHaul(
  options: BuildGroceryHaulSummaryOptions,
): Promise<{ summary: GroceryHaulSummary; full_haul: FullHaulEstimate }> {
  const observations = await listCurrentObservationsForScope(options.personId, options.scope);
  const observationByMatchKey = new Map(
    observations.map((row) => [row.match_key, row]),
  );

  const fullHaul = computeFullHaulEstimate({
    groceryListId: options.groceryListId,
    items: options.items,
    observationsByMatchKey: observationByMatchKey,
    listPlanId: options.listPlanId ?? options.scope.planId,
    planLabels: options.planLabels,
    tax: options.tax ?? { status: 'excluded' },
  });

  return {
    summary: groceryHaulSummaryFromFullHaul(fullHaul),
    full_haul: fullHaul,
  };
}
