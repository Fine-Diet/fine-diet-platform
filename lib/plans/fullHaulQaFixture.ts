/**
 * Development-only deterministic Full Haul QA fixture.
 *
 * Activated only when NODE_ENV !== 'production' and the query param
 * `qa_full_haul=segments` is present. Never persists or mutates grocery data.
 */

import type { FullHaulEstimate, GroceryHaulSummary } from './groceryPricingTypes';

export const FULL_HAUL_QA_PARAM = 'qa_full_haul';
export const FULL_HAUL_QA_SEGMENTS_VALUE = 'segments';

/** Production builds inline NODE_ENV=production, so this is permanently false there. */
export function isFullHaulQaSegmentsEnabled(
  qaParam: string | string[] | undefined,
): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const value = Array.isArray(qaParam) ? qaParam[0] : qaParam;
  return value === FULL_HAUL_QA_SEGMENTS_VALUE;
}

function summaryFromFullHaul(fullHaul: FullHaulEstimate): GroceryHaulSummary {
  return {
    grocery_list_id: fullHaul.grocery_list_id,
    currency: fullHaul.currency,
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

/**
 * Founder-review fixture: expandable plan / meal-map / household / Shared
 * segments that sum exactly to merchandise subtotal; tax only at Full Haul.
 */
export function buildFullHaulSegmentsQaFixture(options?: {
  groceryListId?: string;
}): { summary: GroceryHaulSummary; full_haul: FullHaulEstimate } {
  const groceryListId = options?.groceryListId ?? 'qa-full-haul-segments';

  const fullHaul: FullHaulEstimate = {
    grocery_list_id: groceryListId,
    currency: 'USD',
    estimated_merchandise_subtotal: 186.4,
    estimated_tax: 8.75,
    tax_status: 'estimated',
    tax_disclosure: 'Estimated tax only — QA fixture for founder review (not retailer-confirmed).',
    estimated_total: 195.15,
    priced_item_count: 42,
    eligible_item_count: 47,
    unpriced_item_count: 5,
    priced_coverage_percent: 89.4,
    stale_item_count: 0,
    average_match_confidence: 0.72,
    newest_price_at: '2026-07-30T12:00:00.000Z',
    oldest_price_at: '2026-07-28T12:00:00.000Z',
    is_incomplete_estimate: true,
    estimate_confidence: 'Moderate-confidence priced coverage',
    observation_manual_subtotal: 32.1,
    observation_sourced_subtotal: 154.3,
    segments: [
      {
        segment_key: 'plan:rashad-weekly',
        kind: 'plan',
        label: 'Rashad — Weekly Meal Plan',
        source_id: 'rashad-weekly',
        estimated_merchandise_subtotal: 74.2,
        priced_item_count: 18,
        allocation_mode: 'exclusive',
        unresolved_item_count: 2,
      },
      {
        segment_key: 'meal_map:craig',
        kind: 'meal_map',
        label: 'Craig — Meal Map',
        source_id: 'craig-meal-map',
        estimated_merchandise_subtotal: 61.35,
        priced_item_count: 15,
        allocation_mode: 'exclusive',
        unresolved_item_count: 1,
      },
      {
        segment_key: 'household_manual',
        kind: 'household_manual',
        label: 'Household Essentials',
        source_id: null,
        estimated_merchandise_subtotal: 32.1,
        priced_item_count: 7,
        allocation_mode: 'exclusive',
        unresolved_item_count: 1,
      },
      {
        segment_key: 'shared_unallocated',
        kind: 'shared_unallocated',
        label: 'Shared / Unallocated',
        source_id: null,
        estimated_merchandise_subtotal: 18.75,
        priced_item_count: 2,
        allocation_mode: 'unallocated',
        unresolved_item_count: 1,
        explanation:
          'Merged or unresolved costs that cannot yet be allocated safely.',
      },
    ],
  };

  return {
    summary: summaryFromFullHaul(fullHaul),
    full_haul: fullHaul,
  };
}
