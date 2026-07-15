/**
 * Persistence for grocery price search cache, events, and observations.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GroceryPriceObservation,
  GroceryPriceSearchOffer,
} from './groceryPricingTypes';
import type { GroceryPriceProviderCandidate } from './groceryPriceProviderTypes';

export interface GroceryPriceSearchEventRow {
  id: string;
  person_id: string;
  grocery_item_id: string;
  grocery_list_id: string;
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
  grocery_item_id: string;
  grocery_list_id: string;
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

export async function getGroceryPriceObservationForItem(
  personId: string,
  groceryItemId: string,
): Promise<GroceryPriceObservation | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_observations')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_item_id', groceryItemId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load grocery price observation: ${error.message}`);
  }
  return data ? mapObservationRow(data) : null;
}

export async function listGroceryPriceObservationsForList(
  personId: string,
  groceryListId: string,
): Promise<GroceryPriceObservation[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_price_observations')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_list_id', groceryListId);
  if (error) {
    throw new Error(`Failed to list grocery price observations: ${error.message}`);
  }
  return (data ?? []).map((row) => mapObservationRow(row));
}

export async function upsertManualGroceryPriceObservation(row: {
  person_id: string;
  grocery_item_id: string;
  grocery_list_id: string;
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
  const existing = await getGroceryPriceObservationForItem(row.person_id, row.grocery_item_id);
  if (existing?.source === 'manual') {
    const { data, error } = await supabaseAdmin
      .from('grocery_price_observations')
      .update({
        retailer: row.retailer,
        postal_code: row.postal_code,
        product_title: row.product_title,
        brand_name: row.brand_name,
        package_size: row.package_size,
        package_unit: row.package_unit,
        unit_price: row.unit_price,
        currency: row.currency,
        package_count: row.package_count,
        line_total: row.line_total,
        product_url: row.product_url,
        image_url: row.image_url,
        retrieved_at: new Date().toISOString(),
        user_confirmed: true,
      })
      .eq('id', existing.id)
      .eq('person_id', row.person_id)
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to update manual grocery price observation: ${error?.message ?? 'unknown'}`);
    }
    return mapObservationRow(data);
  }

  if (existing) {
    throw new Error('Cannot overwrite a sourced grocery price observation with manual entry');
  }

  const { data, error } = await supabaseAdmin
    .from('grocery_price_observations')
    .insert({
      ...row,
      source: 'manual',
      provider_result_id: null,
      search_event_id: null,
      match_confidence: null,
      user_confirmed: true,
      retrieved_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert manual grocery price observation: ${error?.message ?? 'unknown'}`);
  }
  return mapObservationRow(data);
}

export async function upsertSourcedGroceryPriceObservation(row: {
  person_id: string;
  grocery_item_id: string;
  grocery_list_id: string;
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
  const existing = await getGroceryPriceObservationForItem(row.person_id, row.grocery_item_id);
  if (existing?.source === 'manual') {
    throw new Error('Cannot overwrite a manual grocery price observation with sourced confirmation');
  }

  const payload = {
    ...row,
    source: 'serpapi',
    user_confirmed: true,
    retrieved_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('grocery_price_observations')
      .update(payload)
      .eq('id', existing.id)
      .eq('person_id', row.person_id)
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to update sourced grocery price observation: ${error?.message ?? 'unknown'}`);
    }
    return mapObservationRow(data);
  }

  const { data, error } = await supabaseAdmin
    .from('grocery_price_observations')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert sourced grocery price observation: ${error?.message ?? 'unknown'}`);
  }
  return mapObservationRow(data);
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

export function findCandidateInSnapshot(
  snapshot: Record<string, unknown> | null,
  providerResultId: string,
): boolean {
  const top = snapshot?.top;
  if (!Array.isArray(top)) return false;
  return top.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return (entry as { provider_result_id?: string }).provider_result_id === providerResultId;
  });
}
