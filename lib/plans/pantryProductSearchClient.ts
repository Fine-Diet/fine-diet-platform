import type { GroceryPriceSearchQuota } from './groceryPricingTypes';
import type { PantryProductSearchResult } from './pantryProductSearchTypes';

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

export async function fetchPantryProductSearch(input: {
  query: string;
  retailer?: string | null;
}): Promise<PantryProductSearchResult> {
  const res = await fetch('/api/journal/plans/pantry/product-search', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: input.query,
      retailer: input.retailer ?? undefined,
    }),
  });
  const body = await readJsonBody(res);
  if (res.status === 200 || res.status === 502) {
    return body as unknown as PantryProductSearchResult;
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
