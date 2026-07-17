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
import { GroceryPriceProviderError, isGroceryPriceProviderError } from './groceryPriceProviderTypes';
import {
  GROCERY_PRICE_PROVIDER_TIMEOUT_MS,
  isGroceryPriceProviderEnabled,
} from './groceryPricingConfig';
import { assertSafeOutboundUrl } from './groceryPricingValidation';
import {
  buildBrandProductRetailerQuery,
  resolvePrimaryProductName,
} from './groceryPriceSearchQuery';
import {
  extractPackageFromSerpApiShoppingRow,
  parsedPackageToCandidateFields,
} from './groceryPriceSerpApiPackageParse';
import { filterRelevantGroceryPriceCandidates } from './groceryPriceRanking';

export const SERPAPI_GOOGLE_SHOPPING_ENGINE = 'google_shopping';

type SerpApiShoppingResult = {
  position?: number;
  title?: string;
  tagline?: string;
  snippet?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  link?: string;
  product_link?: string;
  thumbnail?: string;
  barcode?: string;
  gtin?: string;
  tag?: string;
  extensions?: string[];
  specs?: Record<string, string | number | null> | Array<{
    name?: string;
    title?: string;
    value?: string;
    description?: string;
    text?: string;
  }>;
  product_attributes?: Array<{
    name?: string;
    title?: string;
    value?: string;
    description?: string;
    text?: string;
  }>;
  product_details?: Record<string, string | number | null> | Array<{
    name?: string;
    title?: string;
    value?: string;
    description?: string;
    text?: string;
  }>;
  product_variations?: Array<{
    name?: string;
    title?: string;
    value?: string;
    description?: string;
    text?: string;
  }>;
};

type SerpApiShoppingResponse = {
  shopping_results?: SerpApiShoppingResult[];
  error?: string;
};

export type SerpApiFetchFn = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<SerpApiShoppingResponse>;

export type SerpApiAbortSource = 'provider_timeout' | 'external_signal' | 'none';

export interface SerpApiRequestDiagnostics {
  started_at: string;
  elapsed_ms: number;
  configured_timeout_ms: number;
  abort_source: SerpApiAbortSource;
}

let liveFetchOverride: SerpApiFetchFn | null = null;
let providerTimeoutMsOverride: number | null = null;
let lastSerpApiRequestDiagnostics: SerpApiRequestDiagnostics | null = null;

export function setSerpApiFetchOverride(fn: SerpApiFetchFn | null): void {
  liveFetchOverride = fn;
}

export function setSerpApiProviderTimeoutMsOverride(ms: number | null): void {
  providerTimeoutMsOverride = ms;
}

export function getLastSerpApiRequestDiagnostics(): SerpApiRequestDiagnostics | null {
  return lastSerpApiRequestDiagnostics;
}

function resolveProviderTimeoutMs(): number {
  return providerTimeoutMsOverride ?? GROCERY_PRICE_PROVIDER_TIMEOUT_MS;
}

function recordSerpApiRequestDiagnostics(input: {
  startedAtMs: number;
  timeoutMs: number;
  abortSource: SerpApiAbortSource;
}): SerpApiRequestDiagnostics {
  const diagnostics: SerpApiRequestDiagnostics = {
    started_at: new Date(input.startedAtMs).toISOString(),
    elapsed_ms: Date.now() - input.startedAtMs,
    configured_timeout_ms: input.timeoutMs,
    abort_source: input.abortSource,
  };
  lastSerpApiRequestDiagnostics = diagnostics;
  return diagnostics;
}

export function buildSerpApiQueries(context: GroceryPriceSearchContext): GroceryPriceProviderQuery[] {
  const retailer = context.retailer.trim();
  const productName = resolvePrimaryProductName(context);
  const queries: GroceryPriceProviderQuery[] = [];

  const brandProductQuery = buildBrandProductRetailerQuery({
    brand_name: context.brand_name,
    product_name: productName,
    retailer,
  });
  if (brandProductQuery) {
    queries.push({
      strategy: 'brand_product_retailer',
      query: brandProductQuery,
    });
  }

  if (context.purchase_quantity != null && context.purchase_unit) {
    const packageQuery = buildBrandProductRetailerQuery({
      brand_name: context.brand_name,
      product_name: productName,
      retailer,
      suffix: `${context.purchase_quantity} ${context.purchase_unit}`,
    });
    if (packageQuery && packageQuery !== brandProductQuery) {
      queries.push({
        strategy: 'exact_brand_product_package_retailer',
        query: packageQuery,
      });
    }
  }

  const fallbackProduct = context.preferred_product?.trim() || context.required_ingredient_name;
  const fallbackQuery = buildBrandProductRetailerQuery({
    brand_name: context.brand_name,
    product_name: fallbackProduct,
    retailer,
  });
  if (
    fallbackQuery
    && !queries.some((entry) => entry.query === fallbackQuery)
  ) {
    queries.push({
      strategy: 'ingredient_fallback_retailer',
      query: fallbackQuery,
    });
  }

  if (context.upc) {
    const upcQuery = buildBrandProductRetailerQuery({
      brand_name: null,
      product_name: `${productName} ${context.upc}`,
      retailer,
    });
    if (upcQuery) {
      queries.push({
        strategy: 'upc_retailer',
        query: upcQuery,
      });
    }
  }

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
  const parsedPackage = extractPackageFromSerpApiShoppingRow(row);
  const packageFields = parsedPackageToCandidateFields(parsedPackage);
  const packageVariant =
    packageFields.package_size != null && packageFields.package_unit
      ? `${packageFields.package_size}-${packageFields.package_unit}`
      : 'size-unavailable';

  return {
    provider: 'serpapi',
    provider_result_id: `serpapi:${index}:${title.toLowerCase().slice(0, 40)}:${packageVariant}`,
    title,
    retailer,
    price,
    currency: 'USD',
    package_text: packageFields.package_text,
    package_size: packageFields.package_size,
    package_unit: packageFields.package_unit,
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

function normalizeDigits(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

const US_ZIP3_TO_SERpAPI_LOCATION: Record<string, string> = {
  '100': 'New York, New York, United States',
  '101': 'New York, New York, United States',
  '102': 'New York, New York, United States',
  '103': 'New York, New York, United States',
  '104': 'New York, New York, United States',
  '112': 'Brooklyn, New York, United States',
  '200': 'Washington, District of Columbia, United States',
  '201': 'Washington, District of Columbia, United States',
  '606': 'Chicago, Illinois, United States',
  '607': 'Chicago, Illinois, United States',
  '750': 'Dallas, Texas, United States',
  '752': 'Dallas, Texas, United States',
  '770': 'Houston, Texas, United States',
  '787': 'Austin, Texas, United States',
  '802': 'Denver, Colorado, United States',
  '803': 'Denver, Colorado, United States',
  '850': 'Phoenix, Arizona, United States',
  '852': 'Phoenix, Arizona, United States',
  '900': 'Los Angeles, California, United States',
  '901': 'Los Angeles, California, United States',
  '902': 'Los Angeles, California, United States',
  '904': 'Los Angeles, California, United States',
  '905': 'Los Angeles, California, United States',
  '906': 'Los Angeles, California, United States',
  '907': 'Los Angeles, California, United States',
  '908': 'Los Angeles, California, United States',
  '910': 'Los Angeles, California, United States',
  '911': 'Los Angeles, California, United States',
  '912': 'Los Angeles, California, United States',
  '913': 'Los Angeles, California, United States',
  '914': 'Los Angeles, California, United States',
  '915': 'Los Angeles, California, United States',
  '916': 'Los Angeles, California, United States',
  '917': 'Los Angeles, California, United States',
  '918': 'Los Angeles, California, United States',
  '919': 'San Diego, California, United States',
  '920': 'San Diego, California, United States',
  '921': 'San Diego, California, United States',
  '941': 'San Francisco, California, United States',
  '942': 'Sacramento, California, United States',
  '943': 'San Jose, California, United States',
  '944': 'San Francisco, California, United States',
  '945': 'Oakland, California, United States',
  '946': 'Oakland, California, United States',
  '947': 'Berkeley, California, United States',
  '948': 'Richmond, California, United States',
  '949': 'San Rafael, California, United States',
  '950': 'San Jose, California, United States',
  '951': 'San Jose, California, United States',
  '952': 'Stockton, California, United States',
  '953': 'Modesto, California, United States',
  '954': 'Santa Rosa, California, United States',
  '955': 'Eureka, California, United States',
  '956': 'Sacramento, California, United States',
  '957': 'Sacramento, California, United States',
  '958': 'Sacramento, California, United States',
  '959': 'Chico, California, United States',
  '981': 'Seattle, Washington, United States',
  '982': 'Seattle, Washington, United States',
  '983': 'Tacoma, Washington, United States',
  '984': 'Tacoma, Washington, United States',
  '985': 'Olympia, Washington, United States',
  '986': 'Vancouver, Washington, United States',
  '988': 'Yakima, Washington, United States',
  '989': 'Yakima, Washington, United States',
  '990': 'Spokane, Washington, United States',
  '992': 'Spokane, Washington, United States',
};

const CA_FSA_TO_SERpAPI_LOCATION: Record<string, string> = {
  M5: 'Toronto, Ontario, Canada',
  M6: 'Toronto, Ontario, Canada',
  V5: 'Vancouver, British Columbia, Canada',
  V6: 'Vancouver, British Columbia, Canada',
  H2: 'Montreal, Quebec, Canada',
  H3: 'Montreal, Quebec, Canada',
  T2: 'Calgary, Alberta, Canada',
  T3: 'Calgary, Alberta, Canada',
  K1: 'Ottawa, Ontario, Canada',
  K2: 'Ottawa, Ontario, Canada',
};

const US_ZIP_RE = /^(\d{5})(?:-\d{4})?$/;
const CA_POSTAL_RE = /^([A-Z]\d[A-Z])[ -]?(\d[A-Z]\d)$/i;
const CANONICAL_LOCATION_RE = /^[^,]+,\s*[^,]+,\s*.+$/;

function normalizeCanadianPostalCode(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function resolveSerpApiLocation(postalCode: string): string | null {
  const trimmed = postalCode.trim();
  if (!trimmed) return null;

  if (CANONICAL_LOCATION_RE.test(trimmed) && !/^\d/.test(trimmed)) {
    return trimmed.replace(/\s+/g, ' ').slice(0, 120);
  }

  const usMatch = trimmed.match(US_ZIP_RE);
  if (usMatch) {
    return US_ZIP3_TO_SERpAPI_LOCATION[usMatch[1].slice(0, 3)] ?? null;
  }

  const caMatch = normalizeCanadianPostalCode(trimmed).match(CA_POSTAL_RE);
  if (caMatch) {
    return CA_FSA_TO_SERpAPI_LOCATION[caMatch[1].slice(0, 2).toUpperCase()] ?? null;
  }

  return null;
}

export function formatSerpApiHttpError(status: number, body: unknown): string {
  const detail = extractSafeSerpApiErrorDetail(body);
  return detail
    ? `SerpAPI request failed (${status}): ${detail}`
    : `SerpAPI request failed (${status})`;
}

function extractSafeSerpApiErrorDetail(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const candidates = [record.error, record.message, record.reason];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const sanitized = sanitizeSerpApiErrorDetail(candidate);
    if (sanitized) return sanitized;
  }
  return null;
}

function sanitizeSerpApiErrorDetail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const redacted = trimmed
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[redacted]')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, (token) =>
      /^(?:sk|key|secret|token)/i.test(token) ? '[redacted]' : token,
    )
    .slice(0, 200);

  return redacted || null;
}

async function readSerpApiResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function defaultSerpApiFetch(
  url: string,
  init?: { signal?: AbortSignal },
): Promise<SerpApiShoppingResponse> {
  const response = await fetch(url, init);
  const body = await readSerpApiResponseBody(response);
  if (!response.ok) {
    throw new GroceryPriceProviderError(
      'provider_error',
      formatSerpApiHttpError(response.status, body),
    );
  }
  return (body ?? {}) as SerpApiShoppingResponse;
}

export function buildSerpApiSearchParams(
  query: GroceryPriceProviderQuery,
  context: GroceryPriceSearchContext,
  apiKey: string,
): URLSearchParams {
  const params = new URLSearchParams({
    engine: SERPAPI_GOOGLE_SHOPPING_ENGINE,
    q: query.query,
    api_key: apiKey,
  });

  const location = resolveSerpApiLocation(context.postal_code);
  if (location) {
    params.set('location', location);
  }

  return params;
}

function buildSerpApiUrl(query: GroceryPriceProviderQuery, context: GroceryPriceSearchContext): string {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new GroceryPriceProviderError('disabled', 'SerpAPI is not configured');
  }
  const params = buildSerpApiSearchParams(query, context, apiKey);
  return `https://serpapi.com/search.json?${params.toString()}`;
}

export const serpApiGroceryPriceProvider: GroceryPriceProviderAdapter = {
  provider: 'serpapi',
  buildQueries: buildSerpApiQueries,
  async search(context, query, options) {
    if (!isGroceryPriceProviderEnabled()) {
      throw new GroceryPriceProviderError('disabled', 'Grocery price provider is disabled');
    }

    const timeoutMs = resolveProviderTimeoutMs();
    const startedAtMs = Date.now();
    lastSerpApiRequestDiagnostics = null;
    const usesExternalSignal = options?.signal != null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
      recordSerpApiRequestDiagnostics({
        startedAtMs,
        timeoutMs,
        abortSource: 'none',
      });
      return {
        provider: 'serpapi',
        query: query.query,
        strategy: query.strategy,
        candidates,
        retrieved_at: retrievedAt,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const abortSource: SerpApiAbortSource = usesExternalSignal
          ? 'external_signal'
          : 'provider_timeout';
        recordSerpApiRequestDiagnostics({
          startedAtMs,
          timeoutMs,
          abortSource,
        });
        if (abortSource === 'provider_timeout') {
          throw new GroceryPriceProviderError(
            'timeout',
            `SerpAPI request timed out after ${timeoutMs}ms (abort_source=provider_timeout, elapsed_ms=${Date.now() - startedAtMs})`,
          );
        }
        throw new GroceryPriceProviderError(
          'timeout',
          `SerpAPI request aborted (abort_source=external_signal, elapsed_ms=${Date.now() - startedAtMs})`,
        );
      }
      recordSerpApiRequestDiagnostics({
        startedAtMs,
        timeoutMs,
        abortSource: 'none',
      });
      if (isGroceryPriceProviderError(error)) throw error;
      throw new GroceryPriceProviderError('provider_error', 'SerpAPI request failed');
    } finally {
      clearTimeout(timeout);
    }
  },
};

export type QueryFallbackOutcome =
  | { kind: 'results'; result: GroceryPriceProviderResult }
  | { kind: 'zero_results' };

export function createLimitedQueryAdapter(
  adapter: GroceryPriceProviderAdapter,
  maxQueries: number,
): GroceryPriceProviderAdapter {
  if (!Number.isInteger(maxQueries) || maxQueries < 1) {
    throw new Error('maxQueries must be a positive integer');
  }
  return {
    provider: adapter.provider,
    buildQueries(context) {
      return adapter.buildQueries(context).slice(0, maxQueries);
    },
    search(context, query, options) {
      return adapter.search(context, query, options);
    },
  };
}

export async function searchWithQueryFallback(
  context: GroceryPriceSearchContext,
  adapter: GroceryPriceProviderAdapter = serpApiGroceryPriceProvider,
  options?: { signal?: AbortSignal },
): Promise<QueryFallbackOutcome> {
  const queries = adapter.buildQueries(context);
  let completedAttempts = 0;
  let failedAttempts = 0;
  let lastError: GroceryPriceProviderError | null = null;

  for (const query of queries) {
    try {
      const result = await adapter.search(context, query, options);
      completedAttempts += 1;
      const relevantCandidates = filterRelevantGroceryPriceCandidates(
        context,
        result.candidates,
      );
      if (relevantCandidates.length > 0) {
        return {
          kind: 'results',
          result: {
            ...result,
            candidates: relevantCandidates,
          },
        };
      }
    } catch (error) {
      if (isGroceryPriceProviderError(error) && error.code === 'disabled') {
        throw error;
      }
      if (isGroceryPriceProviderError(error)) {
        failedAttempts += 1;
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (completedAttempts > 0) {
    return { kind: 'zero_results' };
  }

  throw lastError ?? new GroceryPriceProviderError('provider_error', 'All provider strategies failed');
}
