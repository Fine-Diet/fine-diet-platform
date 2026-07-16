/**
 * One-shot Preview live SerpAPI smoke orchestration.
 * Guarded entrypoint used by scripts/groceryPricePreviewLiveSmokeOnce.ts.
 */

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import {
  buildLiveSmokePostalCode,
  buildLiveSmokeReport,
  installSerpApiRequestGuard,
  LIVE_SMOKE_DEFAULT_PROVIDER_TIMEOUT_MS,
  LIVE_SMOKE_MAX_PROVIDER_REQUESTS,
  resolveLiveSmokeProviderTimeoutMs,
  runLiveSmokePreflight,
  type LiveSmokeReport,
} from './groceryPricePreviewLiveSmokeGuard';
import { GROCERY_PRICE_PROVIDER_TIMEOUT_MS } from './groceryPricingConfig';
import {
  getLastSerpApiRequestDiagnostics,
  setSerpApiFetchOverride,
  setSerpApiProviderTimeoutMsOverride,
} from './groceryPriceSerpApiProvider';

export interface PreviewLiveSmokeRunnerOptions {
  personId: string;
  groceryItemId: string;
  retailer?: string;
  postalCode?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function resolveGitHeadSha(cwd: string): string {
  return execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
}

export function resolveAppliedProviderTimeoutMs(env: NodeJS.ProcessEnv): number {
  return resolveLiveSmokeProviderTimeoutMs(env) ?? GROCERY_PRICE_PROVIDER_TIMEOUT_MS;
}

export async function runPreviewLiveSmokeOnce(
  options: PreviewLiveSmokeRunnerOptions,
): Promise<LiveSmokeReport> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const gitHeadSha = resolveGitHeadSha(cwd);
  const providerTimeoutMs = resolveAppliedProviderTimeoutMs(env);

  runLiveSmokePreflight({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    serpApiApiKey: env.SERPAPI_API_KEY,
    liveSmokeAck: env.GROCERY_PRICE_LIVE_SMOKE_ACK,
    gitHeadSha,
    env,
  });

  setSerpApiFetchOverride(null);
  setSerpApiProviderTimeoutMsOverride(resolveLiveSmokeProviderTimeoutMs(env));
  const requestGuard = installSerpApiRequestGuard(LIVE_SMOKE_MAX_PROVIDER_REQUESTS);

  const { buildGroceryPriceSearchQuota } = await import('./groceryPriceQuota');
  const { countBilledGroceryPriceSearches } = await import('./groceryPriceStore');
  const { searchGroceryItemPrices } = await import('./groceryPriceServerService');
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  const smokeEntitlementId = randomUUID();
  const { error: entitlementErr } = await supabaseAdmin.from('person_entitlements').insert({
    id: smokeEntitlementId,
    person_id: options.personId,
    entitlement_key: 'feature:grocery-price-search',
    is_active: true,
    source: 'manual',
    source_ref: 'pr146-preview-live-smoke-once',
    note: 'Temporary premium quota headroom for approved Preview live SerpAPI smoke',
  });
  if (entitlementErr) {
    throw new Error(`Failed to seed smoke entitlement: ${entitlementErr.message}`);
  }

  const postalCode = options.postalCode ?? buildLiveSmokePostalCode();
  const retailer = options.retailer ?? 'Whole Foods Market';

  try {
    const quotaBefore = await buildGroceryPriceSearchQuota({ personId: options.personId });
    const billedBefore = await countBilledGroceryPriceSearches({ personId: options.personId });

    const result = await searchGroceryItemPrices({
      personId: options.personId,
      groceryItemId: options.groceryItemId,
      retailer,
      postalCode,
      maxProviderQueries: LIVE_SMOKE_MAX_PROVIDER_REQUESTS,
    });

    let billed: boolean | null = null;
    let resultCount: number | null = null;
    if (result.search_event_id) {
      const { data: eventRow } = await supabaseAdmin
        .from('grocery_price_search_events')
        .select('billed, result_count, cache_hit')
        .eq('id', result.search_event_id)
        .single();
      billed = eventRow?.billed ?? null;
      resultCount = eventRow?.result_count ?? null;
    }

    const quotaAfter = await buildGroceryPriceSearchQuota({ personId: options.personId });
    const billedAfter = await countBilledGroceryPriceSearches({ personId: options.personId });

    return buildLiveSmokeReport({
      env,
      gitHeadSha,
      providerRequestsObserved: requestGuard.getCount(),
      providerTimeoutMs,
      providerRequestDiagnostics: getLastSerpApiRequestDiagnostics(),
      apiOutcome: result.outcome,
      searchEventId: result.search_event_id,
      resultCount: resultCount ?? result.offers.length,
      cacheHit: result.cache_hit,
      billed,
      quotaBefore,
      quotaAfter,
      billedSearchesBefore: billedBefore,
      billedSearchesAfter: billedAfter,
      postalCode,
      providerError: result.provider_error,
    });
  } finally {
    await supabaseAdmin.from('person_entitlements').delete().eq('id', smokeEntitlementId);
    setSerpApiFetchOverride(null);
    setSerpApiProviderTimeoutMsOverride(null);
    requestGuard.restore();
  }
}

export { LIVE_SMOKE_DEFAULT_PROVIDER_TIMEOUT_MS };
