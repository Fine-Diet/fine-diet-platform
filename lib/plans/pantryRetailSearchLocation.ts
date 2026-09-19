/**
 * Pantry retail search location resolution — server-only.
 *
 * Resolves a full US ZIP or Canadian postal code to a SerpAPI-supported
 * canonical location before paid Google Shopping search.
 */

import { resolveSerpApiLocation } from './groceryPriceSerpApiProvider';
import { normalizePostalCode } from './groceryPricingValidation';

export type PantryRetailSearchLocationResolution = {
  postal_code: string;
  provider_location: string;
  country_code: 'US' | 'CA';
  resolution_source: 'serpapi_supported_locations' | 'legacy_market_fallback';
};

export class PantryRetailSearchLocationError extends Error {
  readonly code: 'location_unresolved' | 'location_timeout';

  constructor(code: PantryRetailSearchLocationError['code'], message: string) {
    super(message);
    this.name = 'PantryRetailSearchLocationError';
    this.code = code;
  }
}

export function isPantryRetailSearchLocationError(
  error: unknown,
): error is PantryRetailSearchLocationError {
  return (
    error instanceof PantryRetailSearchLocationError
    || (error instanceof Error && error.name === 'PantryRetailSearchLocationError')
  );
}

const SUPPORTED_LOCATIONS_URL = 'https://serpapi.com/locations.json';
const DEFAULT_RESOLVER_TIMEOUT_MS = 4000;
const SUPPORTED_LOCATIONS_LIMIT = 10;

const US_POSTAL_RE = /^\d{5}(?:-\d{4})?$/;
const CA_POSTAL_RE = /^[A-Z]\d[A-Z] \d[A-Z]\d$/;

type SerpApiSupportedLocation = {
  name?: string;
  canonical_name?: string;
  country_code?: string;
  target_type?: string;
};

type SupportedLocationsFetchFn = (
  postalCode: string,
  init?: { signal?: AbortSignal },
) => Promise<SerpApiSupportedLocation[]>;

let supportedLocationsFetchOverride: SupportedLocationsFetchFn | null = null;
let resolverTimeoutMsOverride: number | null = null;

export function setPantryRetailLocationsFetchOverride(
  fn: SupportedLocationsFetchFn | null,
): void {
  supportedLocationsFetchOverride = fn;
}

export function setPantryRetailLocationResolverTimeoutMsOverride(ms: number | null): void {
  resolverTimeoutMsOverride = ms;
}

function resolveResolverTimeoutMs(): number {
  return resolverTimeoutMsOverride ?? DEFAULT_RESOLVER_TIMEOUT_MS;
}

function expectedCountryCode(postalCode: string): 'US' | 'CA' {
  return US_POSTAL_RE.test(postalCode) ? 'US' : 'CA';
}

function normalizePostalToken(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function candidateContainsExactPostal(
  candidate: SerpApiSupportedLocation,
  normalizedPostal: string,
): boolean {
  const tokens = [
    candidate.name,
    candidate.canonical_name,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map(normalizePostalToken);
  const target = normalizePostalToken(normalizedPostal);
  return tokens.some((token) => token.includes(target));
}

function isPostalTargetType(targetType: string | undefined): boolean {
  if (!targetType) return false;
  return /postal/i.test(targetType);
}

function scoreSupportedLocationCandidate(
  candidate: SerpApiSupportedLocation,
  normalizedPostal: string,
  expectedCountry: 'US' | 'CA',
): number | null {
  const countryCode = candidate.country_code?.trim().toUpperCase();
  if (countryCode && countryCode !== expectedCountry) return null;

  const canonicalName = candidate.canonical_name?.trim();
  if (!canonicalName) return null;

  if (!candidateContainsExactPostal(candidate, normalizedPostal)) return null;

  let score = 0;
  if (isPostalTargetType(candidate.target_type)) score += 100;
  if (countryCode === expectedCountry) score += 10;
  return score > 0 ? score : 1;
}

function selectBestSupportedLocation(
  candidates: SerpApiSupportedLocation[],
  normalizedPostal: string,
  expectedCountry: 'US' | 'CA',
): SerpApiSupportedLocation | null {
  let best: { candidate: SerpApiSupportedLocation; score: number } | null = null;

  for (const candidate of candidates) {
    const score = scoreSupportedLocationCandidate(candidate, normalizedPostal, expectedCountry);
    if (score == null) continue;
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  return best?.candidate ?? null;
}

async function defaultFetchSupportedLocations(
  postalCode: string,
  init?: { signal?: AbortSignal },
): Promise<SerpApiSupportedLocation[]> {
  const params = new URLSearchParams({
    q: postalCode,
    limit: String(SUPPORTED_LOCATIONS_LIMIT),
  });
  const response = await fetch(`${SUPPORTED_LOCATIONS_URL}?${params.toString()}`, init);
  if (!response.ok) {
    throw new PantryRetailSearchLocationError(
      'location_unresolved',
      'Unable to resolve search location.',
    );
  }

  const body = await response.json();
  if (!Array.isArray(body)) {
    throw new PantryRetailSearchLocationError(
      'location_unresolved',
      'Unable to resolve search location.',
    );
  }

  return body as SerpApiSupportedLocation[];
}

async function fetchSupportedLocations(
  postalCode: string,
  signal?: AbortSignal,
): Promise<SerpApiSupportedLocation[]> {
  const fetchFn = supportedLocationsFetchOverride ?? defaultFetchSupportedLocations;
  return fetchFn(postalCode, { signal });
}

export async function resolvePantryRetailSearchLocation(
  postalCodeInput: string,
): Promise<PantryRetailSearchLocationResolution> {
  const postal_code = normalizePostalCode(postalCodeInput);
  const expectedCountry = expectedCountryCode(postal_code);
  const timeoutMs = resolveResolverTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const candidates = await fetchSupportedLocations(postal_code, controller.signal);
    const selected = selectBestSupportedLocation(candidates, postal_code, expectedCountry);
    const providerLocation = selected?.canonical_name?.trim();
    if (providerLocation) {
      return {
        postal_code,
        provider_location: providerLocation,
        country_code: expectedCountry,
        resolution_source: 'serpapi_supported_locations',
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PantryRetailSearchLocationError(
        'location_timeout',
        'Search location lookup timed out. Try again.',
      );
    }
    if (isPantryRetailSearchLocationError(error) && error.code === 'location_timeout') {
      throw error;
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  const legacyLocation = resolveSerpApiLocation(postal_code);
  if (legacyLocation) {
    return {
      postal_code,
      provider_location: legacyLocation,
      country_code: expectedCountry,
      resolution_source: 'legacy_market_fallback',
    };
  }

  throw new PantryRetailSearchLocationError(
    'location_unresolved',
    'Unable to resolve a market location for that postal code.',
  );
}

export function isCanadianPostalCode(postalCode: string): boolean {
  return CA_POSTAL_RE.test(postalCode);
}
