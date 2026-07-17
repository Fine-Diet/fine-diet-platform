/**
 * Grocery price search quota and entitlement integration.
 */

import { hasEntitlement } from '@/lib/access/accessService';
import {
  GROCERY_PRICE_DEMO_LIFETIME_LIMIT,
  GROCERY_PRICE_PREMIUM_MONTHLY_LIMIT,
  GROCERY_PRICE_SEARCH_ENTITLEMENT,
} from './groceryPricingConfig';
import type { GroceryPriceSearchQuota, GroceryPriceSearchTier } from './groceryPricingTypes';
import { countBilledGroceryPriceSearches } from './groceryPriceStore';

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfNextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export async function resolveGroceryPriceSearchTier(personId: string): Promise<GroceryPriceSearchTier> {
  const entitled = await hasEntitlement(personId, GROCERY_PRICE_SEARCH_ENTITLEMENT);
  return entitled ? 'premium' : 'demo';
}

export async function buildGroceryPriceSearchQuota(options: {
  personId: string;
  consumedThisRequest?: boolean;
}): Promise<GroceryPriceSearchQuota> {
  const tier = await resolveGroceryPriceSearchTier(options.personId);
  const now = new Date();

  if (tier === 'premium') {
    const used = await countBilledGroceryPriceSearches({
      personId: options.personId,
      since: startOfUtcMonth(now).toISOString(),
    });
    const limit = GROCERY_PRICE_PREMIUM_MONTHLY_LIMIT;
    const remaining = Math.max(0, limit - used);
    return {
      tier,
      access_mode: tier,
      limit,
      used,
      remaining,
      reset_at: startOfNextUtcMonth(now).toISOString(),
      consumed_this_request: Boolean(options.consumedThisRequest),
      upgrade_required: remaining === 0,
    };
  }

  const used = await countBilledGroceryPriceSearches({ personId: options.personId });
  const limit = GROCERY_PRICE_DEMO_LIFETIME_LIMIT;
  const remaining = Math.max(0, limit - used);
  return {
    tier,
    access_mode: tier,
    limit,
    used,
    remaining,
    reset_at: null,
    consumed_this_request: Boolean(options.consumedThisRequest),
    upgrade_required: remaining === 0,
  };
}

export async function assertGroceryPriceSearchAllowed(personId: string): Promise<GroceryPriceSearchQuota> {
  const quota = await buildGroceryPriceSearchQuota({ personId });
  if (quota.remaining <= 0) {
    throw new GroceryPriceQuotaExceededError(quota);
  }
  return quota;
}

export class GroceryPriceQuotaExceededError extends Error {
  readonly quota: GroceryPriceSearchQuota;

  constructor(quota: GroceryPriceSearchQuota) {
    super('Grocery price search quota exceeded');
    this.name = 'GroceryPriceQuotaExceededError';
    this.quota = quota;
  }
}
