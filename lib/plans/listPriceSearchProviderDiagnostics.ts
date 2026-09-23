/**
 * Safe runtime diagnostics for List price-search provider failures (Preview + production).
 * Never log secrets or SerpAPI URLs containing api_key.
 */

import type { GroceryPriceSearchProviderError } from './groceryPricingTypes';
import {
  isGroceryPriceProviderEnabled,
  resolveGroceryPriceSerpApiApiKey,
} from './groceryPricingConfig';
import {
  buildSerpApiQueries,
  getLastSerpApiRequestDiagnostics,
} from './groceryPriceSerpApiProvider';
import type { GroceryPriceSearchContext } from './groceryPriceProviderTypes';
import type { PantryRetailSearchLocationResolution } from './pantryRetailSearchLocation';

export type ListPriceSearchQueryStrategyLabel = {
  strategy: string;
  query: string;
};

let lastLocationResolution: PantryRetailSearchLocationResolution | null = null;
let lastQueryStrategies: ListPriceSearchQueryStrategyLabel[] | null = null;

export function recordListPriceSearchLocationResolution(
  resolution: PantryRetailSearchLocationResolution,
): void {
  lastLocationResolution = resolution;
}

export function recordListPriceSearchQueryStrategiesFromContext(
  context: GroceryPriceSearchContext,
): void {
  lastQueryStrategies = buildSerpApiQueries(context).map((entry) => ({
    strategy: entry.strategy,
    query: entry.query,
  }));
}

export function resetListPriceSearchProviderDiagnostics(): void {
  lastLocationResolution = null;
  lastQueryStrategies = null;
}

export function logListPriceSearchProviderError(input: {
  listId: string;
  itemId: string;
  retailer: string;
  postalCode: string;
  providerError: GroceryPriceSearchProviderError;
}): void {
  const serpApiKeyConfigured = Boolean(resolveGroceryPriceSerpApiApiKey());
  const groceryProviderEnabled = isGroceryPriceProviderEnabled();
  const providerRequestDiagnostics = getLastSerpApiRequestDiagnostics();

  console.warn('[list price-search] provider_error', {
    vercel_env: process.env.VERCEL_ENV ?? null,
    git_branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    list_id: input.listId,
    item_id: input.itemId,
    provider_error_code: input.providerError.code,
    provider_error_message: input.providerError.message,
    serpapi_api_key_configured: serpApiKeyConfigured,
    grocery_price_provider_enabled: groceryProviderEnabled,
    retailer: input.retailer,
    postal_code: input.postalCode,
    provider_location: lastLocationResolution?.provider_location ?? null,
    location_resolution_source: lastLocationResolution?.resolution_source ?? null,
    provider_request_diagnostics: providerRequestDiagnostics,
    query_strategies: lastQueryStrategies,
  });
}
