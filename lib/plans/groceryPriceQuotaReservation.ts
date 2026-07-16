/**
 * Atomic quota reservation before paid provider calls.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  GROCERY_PRICE_DEMO_LIFETIME_LIMIT,
  GROCERY_PRICE_PREMIUM_MONTHLY_LIMIT,
  GROCERY_PRICE_QUOTA_CLAIM_TTL_SECONDS,
} from './groceryPricingConfig';
import { resolveGroceryPriceSearchTier } from './groceryPriceQuota';
import { GroceryPriceQuotaExceededError, buildGroceryPriceSearchQuota } from './groceryPriceQuota';

export function quotaWindowKeyForTier(
  tier: 'demo' | 'premium',
  now: Date = new Date(),
): string {
  if (tier === 'demo') return 'lifetime';
  const month = now.getUTCMonth() + 1;
  return `${now.getUTCFullYear()}-${String(month).padStart(2, '0')}`;
}

export function quotaLimitForTier(tier: 'demo' | 'premium'): number {
  return tier === 'premium'
    ? GROCERY_PRICE_PREMIUM_MONTHLY_LIMIT
    : GROCERY_PRICE_DEMO_LIFETIME_LIMIT;
}

let claimQuotaOverride:
  | ((personId: string, windowKey: string, limit: number) => Promise<string | null>)
  | null = null;

export function setClaimGroceryPriceQuotaOverride(
  fn: ((personId: string, windowKey: string, limit: number) => Promise<string | null>) | null,
): void {
  claimQuotaOverride = fn;
}

async function claimQuotaSlot(
  personId: string,
  windowKey: string,
  limit: number,
): Promise<string | null> {
  if (claimQuotaOverride) {
    return claimQuotaOverride(personId, windowKey, limit);
  }
  const { data, error } = await supabaseAdmin.rpc('claim_grocery_price_search_quota', {
    p_person_id: personId,
    p_window_key: windowKey,
    p_limit: limit,
    p_claim_ttl_seconds: GROCERY_PRICE_QUOTA_CLAIM_TTL_SECONDS,
  });
  if (error) {
    throw new Error(`Failed to claim grocery price search quota: ${error.message}`);
  }
  return (data as string | null) ?? null;
}

export async function finalizeQuotaClaim(options: {
  claimId: string;
  status: 'billed' | 'released';
  searchEventId?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('grocery_price_search_quota_claims')
    .update({
      status: options.status,
      search_event_id: options.searchEventId ?? null,
      finalized_at: new Date().toISOString(),
    })
    .eq('id', options.claimId);
  if (error) {
    throw new Error(`Failed to finalize grocery price quota claim: ${error.message}`);
  }
}

export async function reserveGroceryPriceSearchQuota(personId: string): Promise<{
  claimId: string;
  tier: 'demo' | 'premium';
  windowKey: string;
}> {
  const tier = await resolveGroceryPriceSearchTier(personId);
  const windowKey = quotaWindowKeyForTier(tier);
  const limit = quotaLimitForTier(tier);
  const claimId = await claimQuotaSlot(personId, windowKey, limit);
  if (!claimId) {
    const quota = await buildGroceryPriceSearchQuota({ personId });
    throw new GroceryPriceQuotaExceededError(quota);
  }
  return { claimId, tier, windowKey };
}
