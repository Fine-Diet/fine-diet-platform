/**
 * Grocery price search configuration — server-only.
 */

export const GROCERY_PRICE_SEARCH_ENTITLEMENT = 'feature:grocery-price-search';

export const GROCERY_PRICE_DEMO_LIFETIME_LIMIT = readPositiveInt(
  process.env.GROCERY_PRICE_DEMO_LIFETIME_LIMIT,
  2,
);

export const GROCERY_PRICE_PREMIUM_MONTHLY_LIMIT = readPositiveInt(
  process.env.GROCERY_PRICE_PREMIUM_MONTHLY_LIMIT,
  50,
);

export const GROCERY_PRICE_CACHE_TTL_DAYS = readPositiveInt(
  process.env.GROCERY_PRICE_CACHE_TTL_DAYS,
  7,
);

export const GROCERY_PRICE_PROVIDER_TIMEOUT_MS = readPositiveInt(
  process.env.GROCERY_PRICE_PROVIDER_TIMEOUT_MS,
  12_000,
);

export const PANTRY_PRODUCT_SEARCH_TIMEOUT_MS = readPositiveInt(
  process.env.PANTRY_PRODUCT_SEARCH_TIMEOUT_MS,
  20_000,
);

export const GROCERY_PRICE_SEARCH_EVENT_MAX_AGE_MS = readPositiveInt(
  process.env.GROCERY_PRICE_SEARCH_EVENT_MAX_AGE_MS,
  60 * 60 * 1000,
);

export const GROCERY_PRICE_QUOTA_CLAIM_TTL_SECONDS = readPositiveInt(
  process.env.GROCERY_PRICE_QUOTA_CLAIM_TTL_SECONDS,
  300,
);

export function isGroceryPriceProviderEnabled(): boolean {
  const raw = process.env.GROCERY_PRICE_PROVIDER_ENABLED;
  if (raw == null || raw.trim() === '') return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}

/** Treat whitespace-only values as unset (e.g. SERPAPI_API_KEY="" in .env.production.local). */
export function resolveGroceryPriceSerpApiApiKey(): string | null {
  const raw = process.env.SERPAPI_API_KEY;
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

let loggedMissingSerpApiKey = false;

export function warnIfGroceryPriceSerpApiKeyMissingInDev(): void {
  if (process.env.NODE_ENV !== 'development' || loggedMissingSerpApiKey) return;
  loggedMissingSerpApiKey = true;
  if (!resolveGroceryPriceSerpApiApiKey()) {
    console.warn(
      '[grocery-price] SERPAPI_API_KEY is missing or empty in this Node process. '
      + 'Restart next dev after fixing env files; an empty override in .env.production.local '
      + 'can mask a valid .env.local value until restart.',
    );
  }
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
