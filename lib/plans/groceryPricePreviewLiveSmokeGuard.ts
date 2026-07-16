/**
 * Hard safeguards for the one-shot Preview live SerpAPI smoke runner.
 * Pure helpers are unit-tested; runtime guards abort before any provider call.
 */

import type { GroceryPriceSearchQuota } from './groceryPricingTypes';
import type { GroceryPriceSearchProviderError } from './groceryPricingTypes';
import type { SerpApiRequestDiagnostics } from './groceryPriceSerpApiProvider';

export const LIVE_SMOKE_EXPECTED_HEAD_SHA = '14519a71e3332fd165a94fcf3cc794ca98715b5a';
export const LIVE_SMOKE_PREVIEW_SUPABASE_PROJECT_REF = 'tssvlflebugqhtogqdfs';
export const LIVE_SMOKE_BRIDGE_AUTHORIZATION_MESSAGE_ID = 'c049cd0c-a8f6-4d3c-ba15-611c27875199';
export const LIVE_SMOKE_ACK_ENV = 'GROCERY_PRICE_LIVE_SMOKE_ACK';
export const LIVE_SMOKE_HEAD_SHA_ENV = 'GROCERY_PRICE_LIVE_SMOKE_HEAD_SHA';
export const LIVE_SMOKE_BRIDGE_MESSAGE_ENV = 'GROCERY_PRICE_LIVE_SMOKE_BRIDGE_MESSAGE_ID';
export const LIVE_SMOKE_PROVIDER_TIMEOUT_ENV = 'GROCERY_PRICE_LIVE_SMOKE_PROVIDER_TIMEOUT_MS';
export const LIVE_SMOKE_DEFAULT_PROVIDER_TIMEOUT_MS = 12_000;
export const LIVE_SMOKE_MIN_PROVIDER_TIMEOUT_MS = 5_000;
export const LIVE_SMOKE_MAX_PROVIDER_TIMEOUT_MS = 60_000;
export const LIVE_SMOKE_MAX_PROVIDER_REQUESTS = 1;

export class GroceryPricePreviewLiveSmokeGuardError extends Error {
  readonly code:
    | 'missing_ack'
    | 'missing_serpapi_key'
    | 'missing_supabase_url'
    | 'wrong_supabase_project'
    | 'head_sha_mismatch'
    | 'provider_request_limit'
    | 'invalid_provider_timeout';

  constructor(code: GroceryPricePreviewLiveSmokeGuardError['code'], message: string) {
    super(message);
    this.name = 'GroceryPricePreviewLiveSmokeGuardError';
    this.code = code;
  }
}

export interface LiveSmokePreflightInput {
  supabaseUrl: string | undefined;
  serpApiApiKey: string | undefined;
  liveSmokeAck: string | undefined;
  gitHeadSha: string;
  expectedHeadSha?: string;
  env?: NodeJS.ProcessEnv;
}

export interface LiveSmokeReport {
  bridge_authorization_message_id: string;
  expected_head_sha: string;
  default_expected_head_sha: string;
  actual_head_sha: string;
  preview_supabase_project_ref: string;
  execution_mode: 'preview_service_layer_live_serpapi';
  no_retry: true;
  max_provider_requests: number;
  provider_requests_observed: number;
  provider_timeout_ms: number;
  provider_request_diagnostics: SerpApiRequestDiagnostics | null;
  api_outcome: string;
  http_status_equivalent: number;
  search_event_id: string | null;
  result_count: number | null;
  cache_hit: boolean | null;
  billed: boolean | null;
  quota_before: GroceryPriceSearchQuota;
  quota_after: GroceryPriceSearchQuota;
  billed_searches_before: number;
  billed_searches_after: number;
  postal_code: string;
  paid_serpapi_calls: number;
  provider_error: GroceryPriceSearchProviderError | null;
}

export function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  const trimmed = supabaseUrl.trim();
  const match = trimmed.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function assertPreviewSupabaseProject(
  supabaseUrl: string | undefined,
  expectedRef: string = LIVE_SMOKE_PREVIEW_SUPABASE_PROJECT_REF,
): void {
  if (!supabaseUrl?.trim()) {
    throw new GroceryPricePreviewLiveSmokeGuardError(
      'missing_supabase_url',
      'NEXT_PUBLIC_SUPABASE_URL is not configured',
    );
  }
  const ref = extractSupabaseProjectRef(supabaseUrl);
  if (ref !== expectedRef.toLowerCase()) {
    throw new GroceryPricePreviewLiveSmokeGuardError(
      'wrong_supabase_project',
      `Refusing live smoke: Supabase project ${ref ?? 'unknown'} is not Preview (${expectedRef})`,
    );
  }
}

export function assertExpectedHeadSha(
  actualHeadSha: string,
  expectedHeadSha: string = LIVE_SMOKE_EXPECTED_HEAD_SHA,
): void {
  const actual = actualHeadSha.trim().toLowerCase();
  const expected = expectedHeadSha.trim().toLowerCase();
  if (actual !== expected) {
    throw new GroceryPricePreviewLiveSmokeGuardError(
      'head_sha_mismatch',
      `Head SHA mismatch: expected ${expectedHeadSha}, got ${actualHeadSha}`,
    );
  }
}

export function assertLiveSmokeAck(
  liveSmokeAck: string | undefined,
  ackEnv: string = LIVE_SMOKE_ACK_ENV,
): void {
  if (liveSmokeAck !== '1') {
    throw new GroceryPricePreviewLiveSmokeGuardError(
      'missing_ack',
      `Set ${ackEnv}=1 to authorize exactly one Preview live SerpAPI smoke`,
    );
  }
}

export function assertSerpApiConfigured(serpApiApiKey: string | undefined): void {
  if (!serpApiApiKey?.trim()) {
    throw new GroceryPricePreviewLiveSmokeGuardError(
      'missing_serpapi_key',
      'SERPAPI_API_KEY is not configured in the environment',
    );
  }
}

export function resolveLiveSmokeExpectedHeadSha(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[LIVE_SMOKE_HEAD_SHA_ENV]?.trim();
  return override || LIVE_SMOKE_EXPECTED_HEAD_SHA;
}

export function resolveLiveSmokeBridgeAuthorizationMessageId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env[LIVE_SMOKE_BRIDGE_MESSAGE_ENV]?.trim();
  return override || LIVE_SMOKE_BRIDGE_AUTHORIZATION_MESSAGE_ID;
}

export function resolveLiveSmokeProviderTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env[LIVE_SMOKE_PROVIDER_TIMEOUT_ENV]?.trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (
    !Number.isFinite(parsed) ||
    parsed < LIVE_SMOKE_MIN_PROVIDER_TIMEOUT_MS ||
    parsed > LIVE_SMOKE_MAX_PROVIDER_TIMEOUT_MS
  ) {
    throw new GroceryPricePreviewLiveSmokeGuardError(
      'invalid_provider_timeout',
      `${LIVE_SMOKE_PROVIDER_TIMEOUT_ENV} must be an integer between ${LIVE_SMOKE_MIN_PROVIDER_TIMEOUT_MS} and ${LIVE_SMOKE_MAX_PROVIDER_TIMEOUT_MS}`,
    );
  }
  return parsed;
}

export function resolveLiveSmokeReportMetadata(env: NodeJS.ProcessEnv = process.env): {
  expectedHeadSha: string;
  bridgeAuthorizationMessageId: string;
  providerTimeoutMs: number | null;
} {
  return {
    expectedHeadSha: resolveLiveSmokeExpectedHeadSha(env),
    bridgeAuthorizationMessageId: resolveLiveSmokeBridgeAuthorizationMessageId(env),
    providerTimeoutMs: resolveLiveSmokeProviderTimeoutMs(env),
  };
}

export function runLiveSmokePreflight(input: LiveSmokePreflightInput): void {
  assertPreviewSupabaseProject(input.supabaseUrl);
  assertExpectedHeadSha(
    input.gitHeadSha,
    input.expectedHeadSha ?? resolveLiveSmokeExpectedHeadSha(input.env),
  );
  assertSerpApiConfigured(input.serpApiApiKey);
  assertLiveSmokeAck(input.liveSmokeAck);
}

export interface SerpApiRequestGuard {
  getCount(): number;
  restore(): void;
}

export function installSerpApiRequestGuard(
  maxRequests: number = LIVE_SMOKE_MAX_PROVIDER_REQUESTS,
): SerpApiRequestGuard {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error('maxRequests must be a positive integer');
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  let count = 0;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes('serpapi.com/')) {
      count += 1;
      if (count > maxRequests) {
        throw new GroceryPricePreviewLiveSmokeGuardError(
          'provider_request_limit',
          `Live smoke guard: exceeded ${maxRequests} SerpAPI request(s)`,
        );
      }
    }
    return originalFetch(input, init);
  };

  return {
    getCount: () => count,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

export function buildLiveSmokePostalCode(seed = Date.now()): string {
  const suffix = String((seed % 90) + 10).padStart(2, '0');
  return `941${suffix}`;
}

export function buildLiveSmokeReport(input: {
  env?: NodeJS.ProcessEnv;
  gitHeadSha: string;
  providerRequestsObserved: number;
  providerTimeoutMs: number;
  providerRequestDiagnostics: SerpApiRequestDiagnostics | null;
  apiOutcome: string;
  searchEventId: string | null;
  resultCount: number | null;
  cacheHit: boolean | null;
  billed: boolean | null;
  quotaBefore: GroceryPriceSearchQuota;
  quotaAfter: GroceryPriceSearchQuota;
  billedSearchesBefore: number;
  billedSearchesAfter: number;
  postalCode: string;
  providerError: GroceryPriceSearchProviderError | null;
}): LiveSmokeReport {
  const env = input.env ?? process.env;
  const metadata = resolveLiveSmokeReportMetadata(env);
  const paidSerpApiCalls =
    input.providerRequestsObserved > 0 && !input.cacheHit && input.apiOutcome === 'results'
      ? input.providerRequestsObserved
      : input.providerRequestsObserved > 0 && !input.cacheHit && input.apiOutcome === 'provider_error'
        ? input.providerRequestsObserved
        : 0;

  return {
    bridge_authorization_message_id: metadata.bridgeAuthorizationMessageId,
    expected_head_sha: metadata.expectedHeadSha,
    default_expected_head_sha: LIVE_SMOKE_EXPECTED_HEAD_SHA,
    actual_head_sha: input.gitHeadSha,
    preview_supabase_project_ref: LIVE_SMOKE_PREVIEW_SUPABASE_PROJECT_REF,
    execution_mode: 'preview_service_layer_live_serpapi',
    no_retry: true,
    max_provider_requests: LIVE_SMOKE_MAX_PROVIDER_REQUESTS,
    provider_requests_observed: input.providerRequestsObserved,
    provider_timeout_ms: input.providerTimeoutMs,
    provider_request_diagnostics: input.providerRequestDiagnostics,
    api_outcome: input.apiOutcome,
    http_status_equivalent: input.apiOutcome === 'provider_error' ? 502 : 200,
    search_event_id: input.searchEventId,
    result_count: input.resultCount,
    cache_hit: input.cacheHit,
    billed: input.billed,
    quota_before: input.quotaBefore,
    quota_after: input.quotaAfter,
    billed_searches_before: input.billedSearchesBefore,
    billed_searches_after: input.billedSearchesAfter,
    postal_code: input.postalCode,
    paid_serpapi_calls: paidSerpApiCalls,
    provider_error: input.providerError,
  };
}
