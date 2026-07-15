/**
 * SerpAPI Google Shopping provider — server-only.
 */

import type {
  GroceryPriceProviderAdapter,
  GroceryPriceProviderCandidate,
  GroceryPriceProviderQuery,
  GroceryPriceProviderResult,
  GroceryPriceSearchContext,
} from './groceryPriceProviderTypes';
import { GroceryPriceProviderError } from './groceryPriceProviderTypes';
import {
  GROCERY_PRICE_PROVIDER_TIMEOUT_MS,
  isGroceryPriceProviderEnabled,
} from './groceryPricingConfig';
import { assertSafeOutboundUrl } from './groceryPricingValidation';

export const SERPAPI_GOOGLE_SHOPPING_ENGINE = 'google_shopping';

type SerpApiShoppingResult = {
  position?: number;
  title?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  link?: string;
  product_link?: string;
  thumbnail?: string;
  barcode?: string;
  gtin?: string;
  extensions?: string[];
};

type SerpApiShoppingResponse = {
  shopping_results?: SerpApiShoppingResult[];
  error?: string;
};

export type SerpApiFetchFn = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<SerpApiShoppingResponse>;

let liveFetchOverride: SerpApiFetchFn | null = null;

export function setSerpApiFetchOverride(fn: SerpApiFetchFn | null): void {
  liveFetchOverride = fn;
}

export function buildSerpApiQueries(context: GroceryPriceSearchContext): GroceryPriceProviderQuery[] {
  const retailer = context.retailer.trim();
  const queries: GroceryPriceProviderQuery[] = [];

  if (context.upc) {
    queries.push({
      strategy: 'upc_retailer',
      query: `${context.upc} ${retailer}`,
    });
  }

  const exactParts = [
    context.brand_name,
    context.canonical_name,
    context.purchase_quantity != null && context.purchase_unit
      ? `${context.purchase_quantity} ${context.purchase_unit}`
      : null,
    retailer,
  ].filter(Boolean);
  if (exactParts.length >= 2) {
    queries.push({
      strategy: 'exact_brand_product_package_retailer',
      query: exactParts.join(' '),
    });
  }

  const brandProductParts = [context.brand_name, context.canonical_name, retailer].filter(Boolean);
  if (brandProductParts.length >= 2) {
    queries.push({
      strategy: 'brand_product_retailer',
      query: brandProductParts.join(' '),
    });
  }

  const fallback = context.preferred_product?.trim() || context.required_ingredient_name;
  queries.push({
    strategy: 'ingredient_fallback_retailer',
    query: `${fallback} ${retailer}`,
  });

  return queries;
}

export function normalizeSerpApiShoppingResults(
  raw: SerpApiShoppingResponse,
  retailer: string,
  retrievedAt: string,
): GroceryPriceProviderCandidate[] {
  const rows = raw.shopping_results ?? [];
  return rows
    .map((row, index) => normalizeSerpApiRow(row, retailer, retrievedAt, index))
    .filter((row): row is GroceryPriceProviderCandidate => row != null);
}

function normalizeSerpApiRow(
  row: SerpApiShoppingResult,
  requestedRetailer: string,
  retrievedAt: string,
  index: number,
): GroceryPriceProviderCandidate | null {
  const title = row.title?.trim();
  if (!title) return null;

  const price = parsePrice(row);
  if (price == null) return null;

  const retailer = row.source?.trim() || requestedRetailer;
  const productUrl = assertSafeOutboundUrl(row.product_link ?? row.link ?? null, 'product_url');
  const imageUrl = assertSafeOutboundUrl(row.thumbnail ?? null, 'image_url');
  const extensions = row.extensions ?? [];
  const isLocal = extensions.some((value) => /in store|nearby|local/i.test(value));

  return {
    provider: 'serpapi',
    provider_result_id: `serpapi:${index}:${title.toLowerCase().slice(0, 40)}`,
    title,
    retailer,
    price,
    currency: 'USD',
    package_text: extractPackageText(title),
    product_url: productUrl,
    image_url: imageUrl,
    upc: normalizeDigits(row.barcode ?? row.gtin),
    is_local: isLocal,
    retrieved_at: retrievedAt,
    source_rank: index,
    match_score: 0,
    match_reasons: [],
  };
}

function parsePrice(row: SerpApiShoppingResult): number | null {
  if (typeof row.extracted_price === 'number' && Number.isFinite(row.extracted_price)) {
    return row.extracted_price;
  }
  const raw = row.price?.replace(/[^0-9.]/g, '');
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPackageText(title: string): string | null {
  const match = title.match(/\b(\d+(?:\.\d+)?\s*(?:oz|lb|lbs|g|kg|ml|l|ct|count|pack)\b)/i);
  return match ? match[1] : null;
}

function normalizeDigits(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

async function defaultSerpApiFetch(
  url: string,
  init?: { signal?: AbortSignal },
): Promise<SerpApiShoppingResponse> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new GroceryPriceProviderError('provider_error', `SerpAPI request failed (${response.status})`);
  }
  return (await response.json()) as SerpApiShoppingResponse;
}

function buildSerpApiUrl(query: GroceryPriceProviderQuery, context: GroceryPriceSearchContext): string {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new GroceryPriceProviderError('disabled', 'SerpAPI is not configured');
  }
  const params = new URLSearchParams({
    engine: SERPAPI_GOOGLE_SHOPPING_ENGINE,
    q: query.query,
    api_key: apiKey,
    location: context.postal_code,
  });
  return `https://serpapi.com/search.json?${params.toString()}`;
}

export const serpApiGroceryPriceProvider: GroceryPriceProviderAdapter = {
  provider: 'serpapi',
  buildQueries: buildSerpApiQueries,
  async search(context, query, options) {
    if (!isGroceryPriceProviderEnabled()) {
      throw new GroceryPriceProviderError('disabled', 'Grocery price provider is disabled');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GROCERY_PRICE_PROVIDER_TIMEOUT_MS);
    const signal = options?.signal ?? controller.signal;

    try {
      const fetchFn = liveFetchOverride ?? defaultSerpApiFetch;
      const url = liveFetchOverride
        ? `https://serpapi.test/search.json?q=${encodeURIComponent(query.query)}`
        : buildSerpApiUrl(query, context);
      const raw = await fetchFn(url, { signal });
      if (raw.error) {
        throw new GroceryPriceProviderError('provider_error', raw.error);
      }
      const retrievedAt = new Date().toISOString();
      const candidates = normalizeSerpApiShoppingResults(raw, context.retailer, retrievedAt);
      return {
        provider: 'serpapi',
        query: query.query,
        strategy: query.strategy,
        candidates,
        retrieved_at: retrievedAt,
      };
    } catch (error) {
      if (error instanceof GroceryPriceProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GroceryPriceProviderError('timeout', 'SerpAPI request timed out');
      }
      throw new GroceryPriceProviderError('provider_error', 'SerpAPI request failed');
    } finally {
      clearTimeout(timeout);
    }
  },
};

export async function searchWithQueryFallback(
  context: GroceryPriceSearchContext,
  adapter: GroceryPriceProviderAdapter = serpApiGroceryPriceProvider,
  options?: { signal?: AbortSignal },
): Promise<GroceryPriceProviderResult | null> {
  const queries = adapter.buildQueries(context);
  for (const query of queries) {
    try {
      const result = await adapter.search(context, query, options);
      if (result.candidates.length > 0) {
        return result;
      }
    } catch (error) {
      if (error instanceof GroceryPriceProviderError && error.code === 'disabled') {
        throw error;
      }
    }
  }
  return null;
}
