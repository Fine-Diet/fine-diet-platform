import type { GroceryHaulSummary, FullHaulEstimate, GroceryPriceSearchQuota } from './groceryPricingTypes';

export function formatGroceryCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatGroceryPriceQuotaMessage(quota: GroceryPriceSearchQuota): string {
  const reset = quota.reset_at ? ` Resets ${new Date(quota.reset_at).toLocaleDateString()}.` : '';
  if (quota.upgrade_required) {
    return `Price search limit reached (${quota.used}/${quota.limit}). Upgrade for more searches.${reset}`;
  }
  return `${quota.remaining} of ${quota.limit} price searches remaining this period.${reset}`;
}

export function formatGroceryHaulSummaryHeadline(summary: GroceryHaulSummary): string {
  return formatGroceryCurrency(summary.estimated_total, summary.currency);
}

export function formatGroceryHaulCoverage(summary: GroceryHaulSummary): string {
  return `${summary.priced_item_count} of ${summary.eligible_item_count} eligible items priced (${summary.priced_coverage_percent}%)`;
}

export function formatGroceryHaulUnpricedLine(summary: GroceryHaulSummary): string | null {
  if (summary.unpriced_item_count <= 0) return null;
  const noun = summary.unpriced_item_count === 1 ? 'item' : 'items';
  return `${summary.unpriced_item_count} ${noun} still need a price`;
}

export function formatFullHaulTaxLine(estimate: Pick<FullHaulEstimate, 'estimated_tax' | 'tax_status' | 'currency'>): string {
  if (estimate.tax_status === 'estimated' && estimate.estimated_tax != null) {
    return `Est. tax ${formatGroceryCurrency(estimate.estimated_tax, estimate.currency)}`;
  }
  if (estimate.tax_status === 'incomplete') {
    return 'Est. tax incomplete';
  }
  return 'Est. tax excluded';
}

export const GROCERY_HAUL_ESTIMATE_DISCLAIMER =
  'Estimate only — not a dated shopping trip, store assignment, or Haul record. Prices may vary by location, promotions, taxes, substitutions, and time.';
