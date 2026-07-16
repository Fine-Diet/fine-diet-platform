import type { GroceryHaulSummary, GroceryPriceSearchQuota } from './groceryPricingTypes';

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
