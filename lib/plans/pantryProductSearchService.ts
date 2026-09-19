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
  GroceryPriceValidationError,
  normalizeOptionalRetailer,
  normalizePostalCode,
} from './groceryPricingValidation';
import {
  searchWithQueryFallback,
  serpApiGroceryPriceProvider,
} from './groceryPriceSerpApiProvider';
import { toPantryProductSearchOffer } from './pantryProductSearchMapping';
import {
  isPantryRetailSearchLocationError,
  resolvePantryRetailSearchLocation,
} from './pantryRetailSearchLocation';
import type {
  PantryProductSearchProvenance,
  PantryProductSearchResult,
  PantryProductSearchScope,
} from './pantryProductSearchTypes';

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

export class PantryProductSearchLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PantryProductSearchLocationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function buildPantryProductSearchContext(input: {
  query: string;
  retailer: string | null;
  postalCode: string;
  providerLocation: string;
}): GroceryPriceSearchContext {
  const normalizedQuery = normalizeQuery(input.query);
  const normalizedRetailer = input.retailer ?? '';
  const digest = createHash('sha256')
    .update(`${normalizedQuery}|${normalizedRetailer}|${input.postalCode}`)
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
    postal_code: input.postalCode,
    provider_location: input.providerLocation,
  };
}

function resolveSearchScope(retailer: string | null): PantryProductSearchScope {
  return retailer ? 'retailer_localized' : 'market';
}

function buildSearchProvenance(input: {
  postalCode: string;
  providerLocation: string;
  retailer: string | null;
}): PantryProductSearchProvenance {
  return {
    requested_postal_code: input.postalCode,
    resolved_provider_location: input.providerLocation,
    retailer: input.retailer,
    scope: resolveSearchScope(input.retailer),
  };
}

function mapLocationResolutionError(error: unknown): never {
  if (isPantryRetailSearchLocationError(error)) {
    throw new PantryProductSearchLocationError(error.message);
  }
  if (error instanceof GroceryPriceValidationError) {
    throw new PantryProductSearchValidationError(error.message);
  }
  throw error;
}

export async function searchPantryProductDetails(options: {
  personId: string;
  query: string;
  postal_code: string;
  retailer?: string | null;
}): Promise<PantryProductSearchResult> {
  const query = normalizeQuery(options.query);
  if (query.length < MIN_QUERY_LENGTH) {
    throw new PantryProductSearchValidationError(
      `Search query must be at least ${MIN_QUERY_LENGTH} characters.`,
    );
  }

  let postalCode: string;
  let retailer: string | null;
  try {
    postalCode = normalizePostalCode(options.postal_code);
    retailer = normalizeOptionalRetailer(options.retailer);
  } catch (error) {
    if (error instanceof GroceryPriceValidationError) {
      throw new PantryProductSearchValidationError(error.message);
    }
    throw error;
  }

  let locationResolution;
  try {
    locationResolution = await resolvePantryRetailSearchLocation(postalCode);
  } catch (error) {
    mapLocationResolutionError(error);
  }

  const searchProvenance = buildSearchProvenance({
    postalCode: locationResolution.postal_code,
    providerLocation: locationResolution.provider_location,
    retailer,
  });

  const context = buildPantryProductSearchContext({
    query,
    retailer,
    postalCode: locationResolution.postal_code,
    providerLocation: locationResolution.provider_location,
  });
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
        search_provenance: searchProvenance,
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
      search_provenance: searchProvenance,
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
        search_provenance: searchProvenance,
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export { GroceryPriceQuotaExceededError };
