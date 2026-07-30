/**
 * Store for grocery_list_price_observations (list-scoped price quotes).
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GroceryListPriceObservation,
  GroceryListPriceObservationSource,
} from './types';

interface PriceRow {
  id: string;
  person_id: string;
  grocery_list_id: string;
  grocery_item_id: string;
  match_key: string;
  purchasing_choice_id: string | null;
  food_object_id: string | null;
  source: GroceryListPriceObservationSource;
  retailer: string | null;
  postal_code: string | null;
  product_title: string;
  brand_name: string | null;
  package_size: number | string | null;
  package_unit: string | null;
  unit_price: number | string;
  currency: string;
  package_count: number | string;
  line_total: number | string;
  product_url: string | null;
  image_url: string | null;
  provider_result_id: string | null;
  search_event_id: string | null;
  retrieved_at: string;
  match_confidence: number | string | null;
  user_confirmed: boolean;
  supersedes_observation_id: string | null;
  created_at: string;
}

function num(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function rowToObservation(row: PriceRow): GroceryListPriceObservation {
  return {
    id: row.id,
    person_id: row.person_id,
    grocery_list_id: row.grocery_list_id,
    grocery_item_id: row.grocery_item_id,
    match_key: row.match_key,
    purchasing_choice_id: row.purchasing_choice_id,
    food_object_id: row.food_object_id,
    source: row.source,
    retailer: row.retailer,
    postal_code: row.postal_code,
    product_title: row.product_title,
    brand_name: row.brand_name,
    package_size: num(row.package_size),
    package_unit: row.package_unit,
    unit_price: num(row.unit_price) ?? 0,
    currency: row.currency || 'USD',
    package_count: num(row.package_count) ?? 1,
    line_total: num(row.line_total) ?? 0,
    product_url: row.product_url,
    image_url: row.image_url,
    provider_result_id: row.provider_result_id,
    search_event_id: row.search_event_id,
    retrieved_at: row.retrieved_at,
    match_confidence: num(row.match_confidence),
    user_confirmed: row.user_confirmed,
    supersedes_observation_id: row.supersedes_observation_id,
    created_at: row.created_at,
  };
}

/**
 * Latest observation per (item_id, match_key) for a list.
 * Prefer listAllListPriceObservations + resolveActiveListPriceForItem for quote pools.
 */
export async function listCurrentListPriceObservations(
  personId: string,
  listId: string,
): Promise<GroceryListPriceObservation[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_price_observations')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_list_id', listId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list grocery list price observations: ${error.message}`);
  }

  const latest = new Map<string, GroceryListPriceObservation>();
  for (const raw of data ?? []) {
    const observation = rowToObservation(raw as PriceRow);
    const key = `${observation.grocery_item_id}::${observation.match_key}`;
    if (!latest.has(key)) {
      latest.set(key, observation);
    }
  }
  return Array.from(latest.values());
}

/**
 * Full quote history for a list (newest first). Used for multi-retailer pools.
 */
export async function listAllListPriceObservations(
  personId: string,
  listId: string,
): Promise<GroceryListPriceObservation[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_price_observations')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_list_id', listId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list grocery list price observation pool: ${error.message}`);
  }
  return (data ?? []).map((row) => rowToObservation(row as PriceRow));
}

export async function getListPriceObservationById(
  personId: string,
  listId: string,
  observationId: string,
): Promise<GroceryListPriceObservation | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_price_observations')
    .select('*')
    .eq('id', observationId)
    .eq('person_id', personId)
    .eq('grocery_list_id', listId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load grocery list price observation: ${error.message}`);
  }
  return data ? rowToObservation(data as PriceRow) : null;
}

export async function getCurrentListPriceObservation(
  personId: string,
  listId: string,
  itemId: string,
  matchKey: string,
): Promise<GroceryListPriceObservation | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_price_observations')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_list_id', listId)
    .eq('grocery_item_id', itemId)
    .eq('match_key', matchKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load grocery list price observation: ${error.message}`);
  }
  return data ? rowToObservation(data as PriceRow) : null;
}

export type AppendListPriceObservationInput = {
  person_id: string;
  grocery_list_id: string;
  grocery_item_id: string;
  match_key: string;
  purchasing_choice_id: string | null;
  food_object_id: string | null;
  source: GroceryListPriceObservationSource;
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
  provider_result_id?: string | null;
  search_event_id?: string | null;
  match_confidence?: number | null;
};

export async function appendListPriceObservation(
  input: AppendListPriceObservationInput,
): Promise<GroceryListPriceObservation> {
  const current = await getCurrentListPriceObservation(
    input.person_id,
    input.grocery_list_id,
    input.grocery_item_id,
    input.match_key,
  );

  const { data, error } = await supabaseAdmin
    .from('grocery_list_price_observations')
    .insert({
      person_id: input.person_id,
      grocery_list_id: input.grocery_list_id,
      grocery_item_id: input.grocery_item_id,
      match_key: input.match_key,
      purchasing_choice_id: input.purchasing_choice_id,
      food_object_id: input.food_object_id,
      source: input.source,
      retailer: input.retailer,
      postal_code: input.postal_code,
      product_title: input.product_title,
      brand_name: input.brand_name,
      package_size: input.package_size,
      package_unit: input.package_unit,
      unit_price: input.unit_price,
      currency: input.currency,
      package_count: input.package_count,
      line_total: input.line_total,
      product_url: input.product_url,
      image_url: input.image_url,
      provider_result_id: input.provider_result_id ?? null,
      search_event_id: input.search_event_id ?? null,
      match_confidence: input.match_confidence ?? null,
      user_confirmed: true,
      retrieved_at: new Date().toISOString(),
      supersedes_observation_id: current?.id ?? null,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to append grocery list price observation: ${error?.message ?? 'unknown'}`,
    );
  }
  return rowToObservation(data as PriceRow);
}
