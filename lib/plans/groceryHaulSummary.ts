/**
 * Deterministic grocery haul summary from confirmed observations.
 */

import type { GroceryHaulSummary } from './groceryPricingTypes';
import type { GroceryItem } from './types';
import type { GroceryListScope } from './groceryShoppingOverrideStore';
import { groceryItemMatchKey } from './groceryMatchKeys';
import { listCurrentObservationsForScope } from './groceryPriceStore';
import { GROCERY_PRICE_CACHE_TTL_DAYS } from './groceryPricingConfig';

function isStale(retrievedAt: string, now: Date): boolean {
  const retrieved = new Date(retrievedAt);
  const ageMs = now.getTime() - retrieved.getTime();
  return ageMs > GROCERY_PRICE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export async function buildGroceryHaulSummary(options: {
  personId: string;
  groceryListId: string;
  scope: GroceryListScope;
  items: GroceryItem[];
}): Promise<GroceryHaulSummary> {
  const observations = await listCurrentObservationsForScope(options.personId, options.scope);
  const observationByMatchKey = new Map(
    observations.map((row) => [row.match_key, row]),
  );

  const eligibleItems = options.items.filter((item) => item.status !== 'skipped');
  const now = new Date();

  let manualSubtotal = 0;
  let sourcedSubtotal = 0;
  let pricedCount = 0;
  let staleCount = 0;
  let incomplete = false;
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let newest: string | null = null;
  let oldest: string | null = null;

  for (const item of eligibleItems) {
    const observation = observationByMatchKey.get(groceryItemMatchKey(item));
    if (!observation) continue;

    pricedCount += 1;
    if (observation.source === 'manual') {
      manualSubtotal += observation.line_total;
    } else {
      sourcedSubtotal += observation.line_total;
    }

    if (isStale(observation.retrieved_at, now)) staleCount += 1;
    if (observation.match_confidence != null) {
      confidenceTotal += observation.match_confidence;
      confidenceCount += 1;
    }

    if (!newest || observation.retrieved_at > newest) newest = observation.retrieved_at;
    if (!oldest || observation.retrieved_at < oldest) oldest = observation.retrieved_at;

    const hasRequiredQty = item.quantity != null && item.quantity > 0;
    const hasPackageSize = observation.package_size != null && observation.package_size > 0;
    if (hasRequiredQty && !hasPackageSize) {
      incomplete = true;
    }
  }

  const eligibleCount = eligibleItems.length;
  const unpricedCount = Math.max(0, eligibleCount - pricedCount);
  const estimatedTotal = manualSubtotal + sourcedSubtotal;
  const coverage = eligibleCount === 0 ? 0 : Math.round((pricedCount / eligibleCount) * 1000) / 10;
  const averageConfidence = confidenceCount > 0
    ? Math.round((confidenceTotal / confidenceCount) * 1000) / 1000
    : null;

  let confidenceSummary: string | null = null;
  if (pricedCount === 0) {
    confidenceSummary = 'No priced items yet';
  } else if (incomplete) {
    confidenceSummary = 'Incomplete estimate — some rows lack safe package conversion';
  } else if (staleCount > 0) {
    confidenceSummary = `${staleCount} priced row(s) may be stale`;
  } else if (averageConfidence != null && averageConfidence >= 0.7) {
    confidenceSummary = 'High-confidence priced coverage';
  } else {
    confidenceSummary = 'Mixed-confidence priced coverage';
  }

  return {
    grocery_list_id: options.groceryListId,
    currency: observations[0]?.currency ?? 'USD',
    estimated_total: Math.round(estimatedTotal * 100) / 100,
    manual_subtotal: Math.round(manualSubtotal * 100) / 100,
    sourced_subtotal: Math.round(sourcedSubtotal * 100) / 100,
    priced_item_count: pricedCount,
    eligible_item_count: eligibleCount,
    total_item_count: eligibleCount,
    unpriced_item_count: unpricedCount,
    priced_coverage_percent: coverage,
    stale_item_count: staleCount,
    average_match_confidence: averageConfidence,
    newest_price_at: newest,
    oldest_price_at: oldest,
    is_incomplete_estimate: incomplete,
    confidence_summary: confidenceSummary,
  };
}
