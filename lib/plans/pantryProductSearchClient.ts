import type { GroceryPriceSearchQuota } from './groceryPricingTypes';
import type {
  PantryProductSearchProvenance,
  PantryProductSearchResult,
} from './pantryProductSearchTypes';

export const PANTRY_PRODUCT_SEARCH_INVALID_RESPONSE_MESSAGE =
  'Product search returned an invalid response.';
export const PANTRY_PRODUCT_SEARCH_UNAVAILABLE_MESSAGE =
  'Product lookup is temporarily unavailable. Please try again.';

export function formatPantryProductSearchProviderErrorMessage(
  _providerError: { code: string; message: string } | null | undefined,
): string {
  return PANTRY_PRODUCT_SEARCH_UNAVAILABLE_MESSAGE;
}

export class PantryProductSearchQuotaExceededError extends Error {
  readonly quota: GroceryPriceSearchQuota;

  constructor(message: string, quota: GroceryPriceSearchQuota) {
    super(message);
    this.name = 'PantryProductSearchQuotaExceededError';
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

function isSearchProvenanceShape(value: unknown): value is PantryProductSearchProvenance {
  if (!isRecord(value)) return false;
  return (
    typeof value.requested_postal_code === 'string'
    && typeof value.resolved_provider_location === 'string'
    && (value.retailer === null || typeof value.retailer === 'string')
    && (value.scope === 'market' || value.scope === 'retailer_localized')
  );
}

export function parsePantryProductSearchResult(
  body: Record<string, unknown>,
): PantryProductSearchResult | null {
  const outcome = body.outcome;
  if (
    outcome !== 'results'
    && outcome !== 'zero_results'
    && outcome !== 'provider_error'
  ) {
    return null;
  }
  if (typeof body.query !== 'string') return null;
  if (!Array.isArray(body.offers)) return null;
  if (!isRecord(body.quota)) return null;
  if (body.provider_error != null && !isProviderErrorShape(body.provider_error)) {
    return null;
  }
  if (body.search_provenance != null && !isSearchProvenanceShape(body.search_provenance)) {
    return null;
  }

  return {
    outcome,
    query: body.query,
    offers: body.offers as PantryProductSearchResult['offers'],
    quota: body.quota as unknown as GroceryPriceSearchQuota,
    provider_error: body.provider_error as PantryProductSearchResult['provider_error'],
    search_provenance: (body.search_provenance ?? null) as PantryProductSearchResult['search_provenance'],
  };
}

export async function fetchPantryProductSearch(input: {
  query: string;
  postal_code: string;
  retailer?: string | null;
}): Promise<PantryProductSearchResult> {
  const res = await fetch('/api/journal/plans/pantry/product-search', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: input.query,
      postal_code: input.postal_code,
      retailer: input.retailer ?? undefined,
    }),
  });
  const body = await readJsonBody(res);
  if (res.status === 200) {
    const parsed = parsePantryProductSearchResult(body);
    if (!parsed) {
      throw new Error(PANTRY_PRODUCT_SEARCH_INVALID_RESPONSE_MESSAGE);
    }
    return parsed;
  }
  if (res.status === 502) {
    const parsed = parsePantryProductSearchResult(body);
    if (parsed?.outcome === 'provider_error') {
      return parsed;
    }
    throw new Error(PANTRY_PRODUCT_SEARCH_UNAVAILABLE_MESSAGE);
  }
  if (res.status === 429) {
    const quota = body.quota;
    if (quota != null && typeof quota === 'object') {
      throw new PantryProductSearchQuotaExceededError(
        errorMessage(body, 'Product search quota exceeded'),
        quota as GroceryPriceSearchQuota,
      );
    }
  }
  throw new Error(errorMessage(body, `Product search failed (${res.status})`));
}
