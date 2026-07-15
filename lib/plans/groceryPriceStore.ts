/**
 * Persistence for grocery price search cache, events, and observations.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GroceryPriceObservation,
  GroceryPriceSearchOffer,
} from './groceryPricingTypes';
import type { GroceryPriceProviderCandidate } from './groceryPriceProviderTypes';
import type { GroceryListScope } from './groceryShoppingOverrideStore';

export interface GroceryPriceSearchEventRow {
  id: string;
  person_id: string;
  grocery_item_id: string | null;
  grocery_list_id: string | null;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  provider: string;
  query: string;
  retailer: string;
  postal_code: string;
  cache_key: string;
  cache_hit: boolean;
  billed: boolean;
  result_count: number;
  candidate_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface GroceryPriceCacheRow {
  cache_key: string;
  food_object_id: string | null;
  preferred_product: string | null;
  retailer: string;
  postal_code: string;
  provider: string;
  query_used: string;
  offers_json: GroceryPriceSearchOffer[];
  retrieved_at: string;
  expires_at: string;
}

function mapObservationRow(row: Record<string, unknown>): GroceryPriceObservation {
  return row as unknown as GroceryPriceObservation;
}

export async function getGroceryPriceCache(
  cacheKey: string,
): Promise<GroceryPriceCacheRow | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_search_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load grocery price cache: ${error.message}`);
  }
  if (!data) return null;
  return data as unknown as GroceryPriceCacheRow;
}

export async function upsertGroceryPriceCache(row: {
  cache_key: string;
  food_object_id: string | null;
  preferred_product: string | null;
  retailer: string;
  postal_code: string;
  provider: string;
  query_used: string;
  offers: GroceryPriceSearchOffer[];
  retrieved_at: string;
  expires_at: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('grocery_price_search_cache').upsert({
    cache_key: row.cache_key,
    food_object_id: row.food_object_id,
    preferred_product: row.preferred_product,
    retailer: row.retailer,
    postal_code: row.postal_code,
    provider: row.provider,
    query_used: row.query_used,
    offers_json: row.offers,
    retrieved_at: row.retrieved_at,
    expires_at: row.expires_at,
  });
  if (error) {
    throw new Error(`Failed to upsert grocery price cache: ${error.message}`);
  }
}

export async function insertGroceryPriceSearchEvent(row: {
  person_id: string;
  grocery_item_id: string | null;
  grocery_list_id: string | null;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  provider: string;
  query: string;
  retailer: string;
  postal_code: string;
  cache_key: string;
  cache_hit: boolean;
  billed: boolean;
  result_count: number;
  candidate_snapshot: Record<string, unknown> | null;
}): Promise<GroceryPriceSearchEventRow> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_search_events')
    .insert(row)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert grocery price search event: ${error?.message ?? 'unknown'}`);
  }
  return data as unknown as GroceryPriceSearchEventRow;
}

export async function getGroceryPriceSearchEvent(
  personId: string,
  searchEventId: string,
): Promise<GroceryPriceSearchEventRow | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_search_events')
    .select('*')
    .eq('id', searchEventId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load grocery price search event: ${error.message}`);
  }
  return data ? (data as unknown as GroceryPriceSearchEventRow) : null;
}

export async function countBilledGroceryPriceSearches(options: {
  personId: string;
  since?: string;
}): Promise<number> {
  let query = supabaseAdmin
    .from('grocery_price_search_events')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', options.personId)
    .eq('billed', true);
  if (options.since) {
    query = query.gte('created_at', options.since);
  }
  const { count, error } = await query;
  if (error) {
    throw new Error(`Failed to count billed grocery price searches: ${error.message}`);
  }
  return count ?? 0;
}

export async function getCurrentObservationForScopeMatch(
  personId: string,
  scope: GroceryListScope,
  matchKey: string,
): Promise<GroceryPriceObservation | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_observations')
    .select('*')
    .eq('person_id', personId)
    .eq('plan_id', scope.planId)
    .eq('date_range_start', scope.dateStart)
    .eq('date_range_end', scope.dateEnd)
    .eq('match_key', matchKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load current grocery price observation: ${error.message}`);
  }
  return data ? mapObservationRow(data) : null;
}

export async function listCurrentObservationsForScope(
  personId: string,
  scope: GroceryListScope,
): Promise<GroceryPriceObservation[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_observations')
    .select('*')
    .eq('person_id', personId)
    .eq('plan_id', scope.planId)
    .eq('date_range_start', scope.dateStart)
    .eq('date_range_end', scope.dateEnd)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list grocery price observations: ${error.message}`);
  }

  const latestByMatchKey = new Map<string, GroceryPriceObservation>();
  for (const row of data ?? []) {
    const observation = mapObservationRow(row);
    if (!latestByMatchKey.has(observation.match_key)) {
      latestByMatchKey.set(observation.match_key, observation);
    }
  }
  return Array.from(latestByMatchKey.values());
}

async function appendObservation(row: {
  person_id: string;
  grocery_item_id: string | null;
  grocery_list_id: string | null;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  source: 'manual' | 'serpapi';
  retailer: string | null;
  postal_code: string | null;
  product_title: string;
  brand_name: string | null;
  package_size: number | null;
  package_unit: string | null;
  unit_price: number;
  currency: string;
  package_count: number;
  line_total: number;
  product_url: string | null;
  image_url: string | null;
  provider_result_id: string | null;
  search_event_id: string | null;
  match_confidence: number | null;
  supersedes_observation_id: string | null;
}): Promise<GroceryPriceObservation> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_observations')
    .insert({
      ...row,
      user_confirmed: true,
      retrieved_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to append grocery price observation: ${error?.message ?? 'unknown'}`);
  }
  return mapObservationRow(data);
}

export async function appendManualGroceryPriceObservation(row: {
  person_id: string;
  grocery_item_id: string | null;
  grocery_list_id: string | null;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  retailer: string | null;
  postal_code: string | null;
  product_title: string;
  brand_name: string | null;
  package_size: number | null;
  package_unit: string | null;
  unit_price: number;
  currency: string;
  package_count: number;
  line_total: number;
  product_url: string | null;
  image_url: string | null;
}): Promise<GroceryPriceObservation> {
  const scope: GroceryListScope = {
    planId: row.plan_id,
    dateStart: row.date_range_start,
    dateEnd: row.date_range_end,
  };
  const current = await getCurrentObservationForScopeMatch(row.person_id, scope, row.match_key);
  if (current?.source === 'serpapi') {
    return appendObservation({
      ...row,
      source: 'manual',
      provider_result_id: null,
      search_event_id: null,
      match_confidence: null,
      supersedes_observation_id: current.id,
    });
  }

  return appendObservation({
    ...row,
    source: 'manual',
    provider_result_id: null,
    search_event_id: null,
    match_confidence: null,
    supersedes_observation_id: current?.id ?? null,
  });
}

export async function appendSourcedGroceryPriceObservation(row: {
  person_id: string;
  grocery_item_id: string | null;
  grocery_list_id: string | null;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  retailer: string | null;
  postal_code: string | null;
  product_title: string;
  brand_name: string | null;
  package_size: number | null;
  package_unit: string | null;
  unit_price: number;
  currency: string;
  package_count: number;
  line_total: number;
  product_url: string | null;
  image_url: string | null;
  provider_result_id: string;
  search_event_id: string;
  match_confidence: number | null;
}): Promise<GroceryPriceObservation> {
  const scope: GroceryListScope = {
    planId: row.plan_id,
    dateStart: row.date_range_start,
    dateEnd: row.date_range_end,
  };
  const current = await getCurrentObservationForScopeMatch(row.person_id, scope, row.match_key);
  if (current?.source === 'manual') {
    throw new Error('Cannot overwrite a manual grocery price observation with sourced confirmation');
  }

  return appendObservation({
    ...row,
    source: 'serpapi',
    supersedes_observation_id: current?.id ?? null,
  });
}

export function buildCandidateSnapshot(
  candidates: GroceryPriceProviderCandidate[],
): Record<string, unknown> {
  const offers = candidates.slice(0, 12).map((candidate) => ({
    provider: candidate.provider,
    provider_result_id: candidate.provider_result_id,
    title: candidate.title,
    retailer: candidate.retailer,
    price: candidate.price,
    currency: candidate.currency,
    package_size: null,
    package_unit: candidate.package_text,
    product_url: candidate.product_url,
    image_url: candidate.image_url,
    location_label: candidate.is_local ? 'In store' : null,
    match_confidence: candidate.match_score,
    match_reasons: candidate.match_reasons,
  }));
  return {
    count: candidates.length,
    offers,
    top: offers.slice(0, 5).map((offer) => ({
      provider_result_id: offer.provider_result_id,
      title: offer.title.slice(0, 120),
      retailer: offer.retailer,
      price: offer.price,
      match_score: offer.match_confidence,
    })),
  };
}

export function searchEventMatchesItemScope(
  event: GroceryPriceSearchEventRow,
  scope: GroceryListScope,
  matchKey: string,
  itemId: string,
): boolean {
  if (
    event.plan_id !== scope.planId ||
    event.date_range_start !== scope.dateStart ||
    event.date_range_end !== scope.dateEnd ||
    event.match_key !== matchKey
  ) {
    return false;
  }
  if (event.grocery_item_id && event.grocery_item_id !== itemId) {
    return false;
  }
  return true;
}
