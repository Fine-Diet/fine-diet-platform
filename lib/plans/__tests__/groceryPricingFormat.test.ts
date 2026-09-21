import fs from 'fs';
import path from 'path';

import {
  formatGroceryCurrency,
  formatGroceryHaulCoverage,
  formatGroceryHaulSummaryHeadline,
  formatGroceryHaulUnpricedLine,
  formatGroceryPriceProviderError,
  formatGroceryPriceQuotaMessage,
  GROCERY_HAUL_ESTIMATE_DISCLAIMER,
  GROCERY_PRICE_PROVIDER_UNAVAILABLE_MANUAL,
  GROCERY_PRICE_PROVIDER_UNAVAILABLE_TRY_AGAIN,
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

  it('maps provider errors to stable user-facing copy', () => {
    const rawDiagnostic =
      'SerpAPI request timed out after 12000ms (abort_source=provider_timeout, elapsed_ms=12001)';
    const cases = [
      { code: 'timeout' as const, message: rawDiagnostic },
      { code: 'provider_error' as const, message: rawDiagnostic },
      { code: 'invalid_response' as const, message: rawDiagnostic },
      { code: 'disabled' as const, message: 'disabled' },
    ];

    for (const error of cases) {
      const copy = formatGroceryPriceProviderError(error);
      expect(copy).not.toContain('SerpAPI');
      expect(copy).not.toContain('provider_timeout');
      expect(copy).not.toContain('abort_source');
      expect(copy).not.toContain('elapsed_ms');
      expect(copy).not.toContain(rawDiagnostic);
    }

    expect(formatGroceryPriceProviderError({ code: 'timeout', message: rawDiagnostic })).toBe(
      GROCERY_PRICE_PROVIDER_UNAVAILABLE_TRY_AGAIN,
    );
    expect(formatGroceryPriceProviderError({ code: 'disabled', message: 'disabled' })).toBe(
      GROCERY_PRICE_PROVIDER_UNAVAILABLE_MANUAL,
    );
    expect(formatGroceryPriceProviderError(null)).toBe(GROCERY_PRICE_PROVIDER_UNAVAILABLE_TRY_AGAIN);
  });

  it('uses the formatter in grocery pricing UI instead of raw provider messages', () => {
    const ui = fs.readFileSync(
      path.join(process.cwd(), 'components/grocery/GroceryPricingUi.tsx'),
      'utf8',
    );
    expect(ui).toContain('formatGroceryPriceProviderError(searchResult.provider_error)');
    expect(ui).not.toContain('provider_error?.message');
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
      estimated_merchandise_subtotal: 42.5,
      estimated_tax: null,
      tax_status: 'excluded',
      tax_disclosure: 'Estimated tax is excluded — shopping location and item taxability are not available yet.',
    };
    expect(formatGroceryHaulSummaryHeadline(summary)).toBe('$42.50');
    expect(formatGroceryHaulCoverage(summary)).toBe('2 of 4 eligible items priced (50%)');
    expect(formatGroceryHaulUnpricedLine(summary)).toBe('2 items still need a price');
    expect(GROCERY_HAUL_ESTIMATE_DISCLAIMER).toContain('Prices may vary');
    expect(GROCERY_HAUL_ESTIMATE_DISCLAIMER).toMatch(/Estimate only/i);
    expect(GROCERY_HAUL_ESTIMATE_DISCLAIMER).toMatch(/not a dated shopping trip/i);
  });
});
