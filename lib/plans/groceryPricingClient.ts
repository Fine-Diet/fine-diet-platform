/**
 * Client fetch helpers for grocery price search APIs.
 */

import type {
  ConfirmSourcedGroceryPriceInput,
  GroceryHaulSummaryBundle,
  GroceryPriceObservation,
  GroceryPriceSearchQuota,
  GroceryPriceSearchResult,
  SaveManualGroceryPriceInput,
} from './groceryPricingTypes';

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
  if (res.status === 200 || res.status === 502) {
    return body as unknown as GroceryPriceSearchResult;
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
): Promise<GroceryPriceObservation> {
  const res = await fetch(`/api/journal/plans/grocery-items/${itemId}/price-confirm`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `Price confirm failed (${res.status})`));
  }
  return (body as { observation: GroceryPriceObservation }).observation;
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
