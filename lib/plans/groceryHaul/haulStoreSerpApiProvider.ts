/**
 * SerpAPI Google Maps local place search — server-only (Haul store roster assist).
 */

import { assertSafeOutboundUrl } from '../groceryPricingValidation';
import {
  GROCERY_PRICE_PROVIDER_TIMEOUT_MS,
  isGroceryPriceProviderEnabled,
  resolveGroceryPriceSerpApiApiKey,
  warnIfGroceryPriceSerpApiKeyMissingInDev,
} from '../groceryPricingConfig';

export const HAUL_STORE_SERPAPI_ENGINE = 'google_maps';

export type HaulStoreSearchCandidate = {
  provider_place_id: string;
  provider_data_id: string | null;
  provider_location: string | null;
  retailer: string;
  store_name: string | null;
  store_location: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type HaulStoreSearchResult = {
  results: HaulStoreSearchCandidate[];
  provider_disabled: boolean;
  provider_error: string | null;
};

type SerpApiLocalResult = {
  place_id?: string;
  data_id?: string;
  title?: string;
  address?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
};

type SerpApiMapsResponse = {
  local_results?: SerpApiLocalResult[];
  error?: string;
};

export type SerpApiMapsFetchFn = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<SerpApiMapsResponse>;

let fetchOverride: SerpApiMapsFetchFn | null = null;

export function setHaulStoreSerpApiFetchOverride(fn: SerpApiMapsFetchFn | null): void {
  fetchOverride = fn;
}

function parseAddressParts(address: string | null | undefined): {
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
} {
  const raw = address?.trim();
  if (!raw) {
    return {
      address_line1: null,
      city: null,
      region: null,
      postal_code: null,
    };
  }
  const segments = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) {
    return {
      address_line1: raw,
      city: null,
      region: null,
      postal_code: null,
    };
  }
  const last = segments[segments.length - 1] ?? '';
  const postalMatch = last.match(/\b(\d{5}(?:-\d{4})?)\b/);
  const postal_code = postalMatch?.[1] ?? null;
  const region = postalMatch
    ? last.replace(postalMatch[0], '').trim() || null
    : (segments.length >= 2 ? segments[segments.length - 1] : null);
  const city = segments.length >= 3 ? segments[segments.length - 2] : null;
  const address_line1 = segments.slice(0, Math.max(1, segments.length - 2)).join(', ') || segments[0];
  return {
    address_line1: address_line1 || null,
    city,
    region,
    postal_code,
  };
}

function normalizeLocalResult(result: SerpApiLocalResult): HaulStoreSearchCandidate | null {
  const placeId = result.place_id?.trim();
  const title = result.title?.trim();
  if (!placeId || !title) return null;
  const addressParts = parseAddressParts(result.address);
  return {
    provider_place_id: placeId,
    provider_data_id: result.data_id?.trim() || null,
    provider_location: null,
    retailer: title,
    store_name: title,
    store_location: result.address?.trim() || null,
    address_line1: addressParts.address_line1,
    city: addressParts.city,
    region: addressParts.region,
    postal_code: addressParts.postal_code,
    country_code: 'US',
    latitude: result.gps_coordinates?.latitude ?? null,
    longitude: result.gps_coordinates?.longitude ?? null,
  };
}

export async function searchHaulStorePlaces(args: {
  query: string;
  locationContext?: string | null;
}): Promise<HaulStoreSearchResult> {
  const query = args.query.trim();
  if (query.length < 2) {
    return { results: [], provider_disabled: false, provider_error: null };
  }

  if (!isGroceryPriceProviderEnabled()) {
    return { results: [], provider_disabled: true, provider_error: null };
  }

  warnIfGroceryPriceSerpApiKeyMissingInDev();
  const apiKey = resolveGroceryPriceSerpApiApiKey();
  if (!apiKey) {
    return { results: [], provider_disabled: true, provider_error: null };
  }

  const params = new URLSearchParams({
    engine: HAUL_STORE_SERPAPI_ENGINE,
    api_key: apiKey,
    q: query,
    type: 'search',
  });
  const location = args.locationContext?.trim();
  if (location) {
    params.set('location', location);
  }

  const url = `https://serpapi.com/search.json?${params.toString()}`;
  assertSafeOutboundUrl(url, 'serpapi_haul_store_search_url');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROCERY_PRICE_PROVIDER_TIMEOUT_MS);
  try {
    const fetchFn = fetchOverride ?? (async (target, init) => {
      const response = await fetch(target, init);
      if (!response.ok) {
        throw new Error(`SerpAPI request failed (${response.status}).`);
      }
      return (await response.json()) as SerpApiMapsResponse;
    });
    const payload = await fetchFn(url, { signal: controller.signal });
    if (payload.error) {
      return { results: [], provider_disabled: false, provider_error: payload.error };
    }
    const results = (payload.local_results ?? [])
      .map(normalizeLocalResult)
      .filter((row): row is HaulStoreSearchCandidate => row != null);
    return { results, provider_disabled: false, provider_error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Store search failed.';
    return { results: [], provider_disabled: false, provider_error: message };
  } finally {
    clearTimeout(timeout);
  }
}
