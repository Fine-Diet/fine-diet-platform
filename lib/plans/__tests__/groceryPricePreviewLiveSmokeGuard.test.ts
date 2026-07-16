import { readFileSync } from 'fs';
import path from 'path';
import {
  assertExpectedHeadSha,
  assertLiveSmokeAck,
  assertPreviewSupabaseProject,
  assertSerpApiConfigured,
  buildLiveSmokePostalCode,
  buildLiveSmokeReport,
  extractSupabaseProjectRef,
  installSerpApiRequestGuard,
  LIVE_SMOKE_ACK_ENV,
  LIVE_SMOKE_BRIDGE_AUTHORIZATION_MESSAGE_ID,
  LIVE_SMOKE_EXPECTED_HEAD_SHA,
  LIVE_SMOKE_MAX_PROVIDER_REQUESTS,
  LIVE_SMOKE_PREVIEW_SUPABASE_PROJECT_REF,
  runLiveSmokePreflight,
} from '../groceryPricePreviewLiveSmokeGuard';
import {
  buildSerpApiQueries,
  createLimitedQueryAdapter,
  serpApiGroceryPriceProvider,
} from '../groceryPriceSerpApiProvider';
import type { GroceryPriceSearchContext } from '../groceryPriceProviderTypes';

const BASE_CONTEXT: GroceryPriceSearchContext = {
  match_key: 'food-1::cup',
  food_object_id: 'food-1',
  canonical_name: 'Baby Spinach',
  brand_name: 'Organic Girl',
  upc: '085412000123',
  image_url: null,
  serving_description: '1 cup',
  required_ingredient_name: 'baby spinach',
  required_quantity: 2,
  required_unit: 'cup',
  preferred_product: 'Organic Girl Baby Spinach',
  purchase_quantity: 5,
  purchase_unit: 'oz',
  retailer: 'Whole Foods Market',
  postal_code: '94110',
};

describe('groceryPricePreviewLiveSmokeGuard', () => {
  it('extracts Supabase project refs from URLs', () => {
    expect(extractSupabaseProjectRef('https://tssvlflebugqhtogqdfs.supabase.co')).toBe(
      'tssvlflebugqhtogqdfs',
    );
    expect(extractSupabaseProjectRef('https://prodref.supabase.co')).toBe('prodref');
  });

  it('accepts only the Preview Supabase project', () => {
    expect(() =>
      assertPreviewSupabaseProject('https://tssvlflebugqhtogqdfs.supabase.co'),
    ).not.toThrow();
    expect(() => assertPreviewSupabaseProject('https://prodref.supabase.co')).toThrow(
      /Refusing live smoke/,
    );
  });

  it('requires the exact expected git HEAD SHA', () => {
    expect(() => assertExpectedHeadSha(LIVE_SMOKE_EXPECTED_HEAD_SHA)).not.toThrow();
    expect(() => assertExpectedHeadSha('deadbeef'.repeat(5))).toThrow(/Head SHA mismatch/);
  });

  it('requires explicit live-smoke acknowledgement', () => {
    expect(() => assertLiveSmokeAck('1')).not.toThrow();
    expect(() => assertLiveSmokeAck(undefined)).toThrow(/GROCERY_PRICE_LIVE_SMOKE_ACK=1/);
  });

  it('requires SerpAPI configuration during preflight', () => {
    expect(() =>
      runLiveSmokePreflight({
        supabaseUrl: 'https://tssvlflebugqhtogqdfs.supabase.co',
        serpApiApiKey: 'test-key',
        liveSmokeAck: '1',
        gitHeadSha: LIVE_SMOKE_EXPECTED_HEAD_SHA,
      }),
    ).not.toThrow();

    expect(() =>
      runLiveSmokePreflight({
        supabaseUrl: 'https://prodref.supabase.co',
        serpApiApiKey: 'test-key',
        liveSmokeAck: '1',
        gitHeadSha: LIVE_SMOKE_EXPECTED_HEAD_SHA,
      }),
    ).toThrow(/Refusing live smoke/);
  });

  it('limits provider fallback to one query strategy', () => {
    const limited = createLimitedQueryAdapter(serpApiGroceryPriceProvider, 1);
    expect(limited.buildQueries(BASE_CONTEXT)).toHaveLength(1);
    expect(limited.buildQueries(BASE_CONTEXT)[0]?.strategy).toBe('upc_retailer');
    expect(buildSerpApiQueries(BASE_CONTEXT)).toHaveLength(4);
  });

  it('builds deterministic Preview postal codes in the 941xx range', () => {
    expect(buildLiveSmokePostalCode(0)).toBe('94110');
    expect(buildLiveSmokePostalCode(9)).toBe('94119');
  });

  it('builds a complete live smoke report payload', () => {
    const report = buildLiveSmokeReport({
      gitHeadSha: LIVE_SMOKE_EXPECTED_HEAD_SHA,
      providerRequestsObserved: 1,
      apiOutcome: 'provider_error',
      searchEventId: 'event-1',
      resultCount: 0,
      cacheHit: false,
      billed: false,
      quotaBefore: {
        tier: 'premium',
        access_mode: 'premium',
        limit: 50,
        used: 4,
        remaining: 46,
        reset_at: '2026-08-01T00:00:00.000Z',
        consumed_this_request: false,
        upgrade_required: false,
      },
      quotaAfter: {
        tier: 'premium',
        access_mode: 'premium',
        limit: 50,
        used: 4,
        remaining: 46,
        reset_at: '2026-08-01T00:00:00.000Z',
        consumed_this_request: false,
        upgrade_required: false,
      },
      billedSearchesBefore: 4,
      billedSearchesAfter: 4,
      postalCode: '94196',
      providerError: { code: 'provider_error', message: 'SerpAPI request failed (400): bad location' },
    });

    expect(report).toMatchObject({
      bridge_authorization_message_id: LIVE_SMOKE_BRIDGE_AUTHORIZATION_MESSAGE_ID,
      expected_head_sha: LIVE_SMOKE_EXPECTED_HEAD_SHA,
      preview_supabase_project_ref: LIVE_SMOKE_PREVIEW_SUPABASE_PROJECT_REF,
      no_retry: true,
      max_provider_requests: LIVE_SMOKE_MAX_PROVIDER_REQUESTS,
      provider_requests_observed: 1,
      search_event_id: 'event-1',
      billed: false,
      provider_error: {
        message: expect.stringContaining('bad location'),
      },
    });
  });

  it('blocks more than one SerpAPI HTTP request', async () => {
    const mockFetch = jest.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;
    const guard = installSerpApiRequestGuard(1);

    try {
      await globalThis.fetch('https://serpapi.com/search.json?q=test');
      await expect(globalThis.fetch('https://serpapi.com/search.json?q=test2')).rejects.toThrow(
        /exceeded 1 SerpAPI request/,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      guard.restore();
    }
  });
});

describe('groceryPricePreviewLiveSmokeOnce script', () => {
  it('documents safeguards and delegates to the guarded runner', () => {
    const scriptPath = path.join(process.cwd(), 'scripts/groceryPricePreviewLiveSmokeOnce.ts');
    const source = readFileSync(scriptPath, 'utf8');

    expect(source).toContain('groceryPricePreviewLiveSmokeGuard.ts');
    expect(source).toContain('groceryPricePreviewLiveSmokeRunner');
    expect(source).toContain('GROCERY_PRICE_LIVE_SMOKE_ACK=1');
    expect(source).toContain(LIVE_SMOKE_PREVIEW_SUPABASE_PROJECT_REF);
    expect(source).toContain(LIVE_SMOKE_EXPECTED_HEAD_SHA);
    expect(source).toContain(LIVE_SMOKE_BRIDGE_AUTHORIZATION_MESSAGE_ID);
    expect(source).not.toMatch(/for\s*\(\s*;/);
    expect(source).not.toMatch(/while\s*\(/);
  });

  it('keeps the acknowledgement env name stable', () => {
    expect(LIVE_SMOKE_ACK_ENV).toBe('GROCERY_PRICE_LIVE_SMOKE_ACK');
  });
});
