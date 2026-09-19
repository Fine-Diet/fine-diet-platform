/**
 * Pantry acquisition product-detail search — server-only SerpAPI orchestration.
 */

import { createHash } from 'crypto';
import type { GroceryPriceSearchContext } from './groceryPriceProviderTypes';
import { isGroceryPriceProviderError } from './groceryPriceProviderTypes';
import { buildGroceryPriceSearchQuota, GroceryPriceQuotaExceededError } from './groceryPriceQuota';
import { finalizeQuotaClaim, reserveGroceryPriceSearchQuota } from './groceryPriceQuotaReservation';
import { rankGroceryPriceCandidates } from './groceryPriceRanking';
import { PANTRY_PRODUCT_SEARCH_TIMEOUT_MS } from './groceryPricingConfig';
import {
  searchWithQueryFallback,
  serpApiGroceryPriceProvider,
} from './groceryPriceSerpApiProvider';
import { toPantryProductSearchOffer } from './pantryProductSearchMapping';
import type { PantryProductSearchResult } from './pantryProductSearchTypes';

const MIN_QUERY_LENGTH = 2;
const MAX_OFFERS = 8;

let pantryProductSearchTimeoutMsOverride: number | null = null;

export function setPantryProductSearchTimeoutMsOverride(ms: number | null): void {
  pantryProductSearchTimeoutMsOverride = ms;
}

function resolvePantryProductSearchTimeoutMs(): number {
  return pantryProductSearchTimeoutMsOverride ?? PANTRY_PRODUCT_SEARCH_TIMEOUT_MS;
}

export class PantryProductSearchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PantryProductSearchValidationError';
  }
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function buildPantryProductSearchContext(
  query: string,
  retailer?: string | null,
): GroceryPriceSearchContext {
  const normalizedQuery = normalizeQuery(query);
  const normalizedRetailer = retailer?.trim() ?? '';
  const digest = createHash('sha256')
    .update(`${normalizedQuery}|${normalizedRetailer}`)
    .digest('hex')
    .slice(0, 16);

  return {
    match_key: `pantry:product-search:${digest}`,
    food_object_id: null,
    canonical_name: null,
    brand_name: null,
    upc: null,
    image_url: null,
    required_ingredient_name: normalizedQuery,
    required_quantity: null,
    required_unit: null,
    preferred_product: null,
    purchase_quantity: null,
    purchase_unit: null,
    retailer: normalizedRetailer,
    postal_code: '',
  };
}

export async function searchPantryProductDetails(options: {
  personId: string;
  query: string;
  retailer?: string | null;
}): Promise<PantryProductSearchResult> {
  const query = normalizeQuery(options.query);
  if (query.length < MIN_QUERY_LENGTH) {
    throw new PantryProductSearchValidationError(
      `Search query must be at least ${MIN_QUERY_LENGTH} characters.`,
    );
  }

  const context = buildPantryProductSearchContext(query, options.retailer);
  const reservation = await reserveGroceryPriceSearchQuota(options.personId);
  const timeoutMs = resolvePantryProductSearchTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fallback = await searchWithQueryFallback(
      context,
      serpApiGroceryPriceProvider,
      { signal: controller.signal },
    );
    if (fallback.kind === 'zero_results') {
      await finalizeQuotaClaim({
        claimId: reservation.claimId,
        status: 'released',
      });
      const quota = await buildGroceryPriceSearchQuota({ personId: options.personId });
      return {
        outcome: 'zero_results',
        query,
        offers: [],
        quota,
        provider_error: null,
      };
    }

    const ranked = rankGroceryPriceCandidates(context, fallback.result.candidates);
    const offers = ranked
      .slice(0, MAX_OFFERS)
      .map(toPantryProductSearchOffer);
    const billed = offers.length > 0;

    await finalizeQuotaClaim({
      claimId: reservation.claimId,
      status: billed ? 'billed' : 'released',
    });

    const quota = await buildGroceryPriceSearchQuota({
      personId: options.personId,
      consumedThisRequest: billed,
    });

    return {
      outcome: offers.length > 0 ? 'results' : 'zero_results',
      query: fallback.result.query,
      offers,
      quota,
      provider_error: null,
    };
  } catch (error) {
    await finalizeQuotaClaim({
      claimId: reservation.claimId,
      status: 'released',
    }).catch(() => undefined);

    if (isGroceryPriceProviderError(error)) {
      const quota = await buildGroceryPriceSearchQuota({ personId: options.personId });
      return {
        outcome: 'provider_error',
        query,
        offers: [],
        quota,
        provider_error: {
          code: error.code,
          message: error.message,
        },
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export { GroceryPriceQuotaExceededError };
