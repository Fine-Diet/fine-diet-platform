import {
  formatGroceryCurrency,
  formatGroceryHaulCoverage,
  formatGroceryHaulSummaryHeadline,
  formatGroceryPriceQuotaMessage,
} from '../groceryPricingFormat';
import type { GroceryHaulSummary, GroceryPriceSearchQuota } from '../groceryPricingTypes';

describe('groceryPricingFormat', () => {
  it('formats currency in USD', () => {
    expect(formatGroceryCurrency(12.5)).toBe('$12.50');
  });

  it('formats quota message with remaining searches', () => {
    const quota: GroceryPriceSearchQuota = {
      tier: 'demo',
      access_mode: 'demo',
      limit: 5,
      used: 2,
      remaining: 3,
      reset_at: '2026-08-01T00:00:00.000Z',
      consumed_this_request: false,
      upgrade_required: false,
    };
    expect(formatGroceryPriceQuotaMessage(quota)).toContain('3 of 5 price searches remaining');
  });

  it('formats upgrade-required quota message', () => {
    const quota: GroceryPriceSearchQuota = {
      tier: 'demo',
      access_mode: 'demo',
      limit: 5,
      used: 5,
      remaining: 0,
      reset_at: null,
      consumed_this_request: false,
      upgrade_required: true,
    };
    expect(formatGroceryPriceQuotaMessage(quota)).toContain('Upgrade for more searches');
  });

  it('formats haul summary headline and coverage', () => {
    const summary: GroceryHaulSummary = {
      grocery_list_id: 'list-1',
      currency: 'USD',
      estimated_total: 42.5,
      manual_subtotal: 10,
      sourced_subtotal: 32.5,
      priced_item_count: 2,
      eligible_item_count: 4,
      total_item_count: 5,
      unpriced_item_count: 2,
      priced_coverage_percent: 50,
      stale_item_count: 0,
      average_match_confidence: 0.9,
      newest_price_at: null,
      oldest_price_at: null,
      is_incomplete_estimate: true,
      confidence_summary: 'Partial coverage',
    };
    expect(formatGroceryHaulSummaryHeadline(summary)).toBe('$42.50');
    expect(formatGroceryHaulCoverage(summary)).toBe('2 of 4 eligible items priced (50%)');
  });
});
