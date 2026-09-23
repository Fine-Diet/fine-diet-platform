import type {
  GroceryHaulSummary,
  FullHaulEstimate,
  GroceryPriceSearchProviderError,
  GroceryPriceSearchQuota,
} from './groceryPricingTypes';

export const GROCERY_PRICE_PROVIDER_UNAVAILABLE_TRY_AGAIN =
  'Price search is temporarily unavailable. Try again or use Manual entry.';

export const GROCERY_PRICE_PROVIDER_UNAVAILABLE_MANUAL =
  'Price search is temporarily unavailable. Use Manual entry.';

export function formatGroceryPriceProviderError(
  error: GroceryPriceSearchProviderError | null | undefined,
): string {
  if (error?.code === 'disabled') {
    const base = GROCERY_PRICE_PROVIDER_UNAVAILABLE_MANUAL;
    if (process.env.NODE_ENV === 'development') {
      return `${base} For localhost, set SERPAPI_API_KEY in .env.local and ensure .env.production.local does not override it with an empty value.`;
    }
    return base;
  }
  return GROCERY_PRICE_PROVIDER_UNAVAILABLE_TRY_AGAIN;
}

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
