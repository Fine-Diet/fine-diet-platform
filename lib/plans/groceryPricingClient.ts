/**
 * Client fetch helpers for grocery price search APIs.
 */

import type {
  ConfirmSourcedGroceryPriceInput,
  GroceryHaulSummaryBundle,
  GroceryPriceConfirmationResult,
  GroceryPriceObservation,
  GroceryPriceSearchQuota,
  GroceryPriceSearchResult,
  SaveManualGroceryPriceInput,
} from './groceryPricingTypes';
import {
  GROCERY_PRICE_MANUAL_REPLACE_REQUIRED_CODE,
  GroceryPriceManualReplaceRequiredError,
} from './groceryPriceManualReplace';

export { GroceryPriceManualReplaceRequiredError };

export const GROCERY_PRICE_SEARCH_INVALID_RESPONSE_MESSAGE =
  'Price search returned an invalid response.';
export const GROCERY_PRICE_SEARCH_UNAVAILABLE_MESSAGE =
  'Price lookup is temporarily unavailable. Please try again.';

export class GroceryPriceQuotaExceededClientError extends Error {
  readonly quota: GroceryPriceSearchQuota;

  constructor(message: string, quota: GroceryPriceSearchQuota) {
    super(message);
    this.name = 'GroceryPriceQuotaExceededClientError';
    this.quota = quota;
  }
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorMessage(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' ? body.error : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isProviderErrorShape(
  value: unknown,
): value is { code: string; message: string } {
  return (
    isRecord(value)
    && typeof value.code === 'string'
    && typeof value.message === 'string'
  );
}

export function parseGroceryPriceSearchResult(
  body: Record<string, unknown>,
): GroceryPriceSearchResult | null {
  const outcome = body.outcome;
  if (
    outcome !== 'results'
    && outcome !== 'zero_results'
    && outcome !== 'provider_error'
  ) {
    return null;
  }
  if (typeof body.search_event_id !== 'string') return null;
  if (typeof body.query !== 'string') return null;
  if (typeof body.retailer !== 'string') return null;
  if (typeof body.postal_code !== 'string') return null;
  if (typeof body.retrieved_at !== 'string') return null;
  if (typeof body.expires_at !== 'string') return null;
  if (typeof body.cache_hit !== 'boolean') return null;
  if (!Array.isArray(body.offers)) return null;
  if (!isRecord(body.quota)) return null;
  if (body.provider_error != null && !isProviderErrorShape(body.provider_error)) {
    return null;
  }

  return {
    provider: 'serpapi',
    search_event_id: body.search_event_id,
    query: body.query,
    retailer: body.retailer,
    postal_code: body.postal_code,
    cache_hit: body.cache_hit,
    outcome,
    retrieved_at: body.retrieved_at,
    expires_at: body.expires_at,
    offers: body.offers as GroceryPriceSearchResult['offers'],
    quota: body.quota as unknown as GroceryPriceSearchQuota,
    provider_error: body.provider_error as GroceryPriceSearchResult['provider_error'],
  };
}

export async function fetchGroceryPriceSearch(
  itemId: string,
  input: { retailer: string; postal_code: string },
): Promise<GroceryPriceSearchResult> {
  const res = await fetch(`/api/journal/plans/grocery-items/${itemId}/price-search`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJsonBody(res);
  if (res.status === 200) {
    const parsed = parseGroceryPriceSearchResult(body);
    if (!parsed) {
      throw new Error(GROCERY_PRICE_SEARCH_INVALID_RESPONSE_MESSAGE);
    }
    return parsed;
  }
  if (res.status === 502) {
    const parsed = parseGroceryPriceSearchResult(body);
    if (parsed?.outcome === 'provider_error') {
      return parsed;
    }
    throw new Error(GROCERY_PRICE_SEARCH_UNAVAILABLE_MESSAGE);
  }
  if (res.status === 429) {
    const quota = body.quota;
    if (quota != null && typeof quota === 'object') {
      throw new GroceryPriceQuotaExceededClientError(
        errorMessage(body, 'Grocery price search quota exceeded'),
        quota as GroceryPriceSearchQuota,
      );
    }
  }
  throw new Error(errorMessage(body, `Price search failed (${res.status})`));
}

export async function fetchListGroceryPriceSearch(
  listId: string,
  itemId: string,
  input: { retailer: string; postal_code: string },
): Promise<GroceryPriceSearchResult> {
  const res = await fetch(
    `/api/journal/food/grocery-lists/${listId}/items/${itemId}/price-search`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const body = await readJsonBody(res);
  if (res.status === 200) {
    const parsed = parseGroceryPriceSearchResult(body);
    if (!parsed) {
      throw new Error(GROCERY_PRICE_SEARCH_INVALID_RESPONSE_MESSAGE);
    }
    return parsed;
  }
  if (res.status === 502) {
    const parsed = parseGroceryPriceSearchResult(body);
    if (parsed?.outcome === 'provider_error') {
      return parsed;
    }
    throw new Error(GROCERY_PRICE_SEARCH_UNAVAILABLE_MESSAGE);
  }
  if (res.status === 429) {
    const quota = body.quota;
    if (quota != null && typeof quota === 'object') {
      throw new GroceryPriceQuotaExceededClientError(
        errorMessage(body, 'Grocery price search quota exceeded'),
        quota as GroceryPriceSearchQuota,
      );
    }
  }
  throw new Error(errorMessage(body, `Price search failed (${res.status})`));
}

export async function fetchConfirmGroceryPrice(
  itemId: string,
  input: Omit<ConfirmSourcedGroceryPriceInput, 'grocery_item_id'>,
): Promise<GroceryPriceConfirmationResult> {
  const res = await fetch(`/api/journal/plans/grocery-items/${itemId}/price-confirm`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJsonBody(res);
  if (res.status === 409) {
    const code = body.code;
    const currentObservation = body.current_observation;
    if (
      code === GROCERY_PRICE_MANUAL_REPLACE_REQUIRED_CODE &&
      currentObservation != null &&
      typeof currentObservation === 'object'
    ) {
      throw new GroceryPriceManualReplaceRequiredError(
        currentObservation as GroceryPriceObservation,
      );
    }
  }
  if (!res.ok) {
    throw new Error(errorMessage(body, `Price confirm failed (${res.status})`));
  }
  return body as unknown as GroceryPriceConfirmationResult;
}

export async function fetchManualGroceryPrice(
  itemId: string,
  input: Omit<SaveManualGroceryPriceInput, 'grocery_item_id'>,
): Promise<GroceryPriceObservation> {
  const res = await fetch(`/api/journal/plans/grocery-items/${itemId}/price-manual`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `Manual price save failed (${res.status})`));
  }
  return (body as { observation: GroceryPriceObservation }).observation;
}

export async function fetchGroceryHaulSummary(
  planId: string,
  groceryListId: string,
): Promise<GroceryHaulSummaryBundle> {
  const params = new URLSearchParams({ grocery_list_id: groceryListId });
  const res = await fetch(
    `/api/journal/plans/${planId}/grocery/haul-summary?${params.toString()}`,
    { credentials: 'include' },
  );
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `Haul summary failed (${res.status})`));
  }
  return body as unknown as GroceryHaulSummaryBundle;
}

export async function fetchPersistentGroceryHaulSummary(
  listId: string,
): Promise<GroceryHaulSummaryBundle> {
  const res = await fetch(
    `/api/journal/food/grocery-lists/${listId}/haul-summary`,
    { credentials: 'include' },
  );
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `Persistent haul summary failed (${res.status})`));
  }
  return body as unknown as GroceryHaulSummaryBundle;
}

export const GROCERY_PRICE_PREFS_STORAGE_KEY = 'grocery_price_search_prefs';

export function loadGroceryPriceSearchPrefs(): { retailer: string; postal_code: string } {
  if (typeof window === 'undefined') {
    return { retailer: '', postal_code: '' };
  }
  try {
    const raw = window.sessionStorage.getItem(GROCERY_PRICE_PREFS_STORAGE_KEY);
    if (!raw) return { retailer: '', postal_code: '' };
    const parsed = JSON.parse(raw) as { retailer?: string; postal_code?: string };
    return {
      retailer: parsed.retailer ?? '',
      postal_code: parsed.postal_code ?? '',
    };
  } catch {
    return { retailer: '', postal_code: '' };
  }
}

export function saveGroceryPriceSearchPrefs(input: {
  retailer: string;
  postal_code: string;
}): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(GROCERY_PRICE_PREFS_STORAGE_KEY, JSON.stringify(input));
}
