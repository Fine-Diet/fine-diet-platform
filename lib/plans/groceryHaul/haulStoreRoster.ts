/**
 * Haul Store Roster v1 — server-only roster persistence and search orchestration.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { GroceryHaul, GroceryHaulStore } from '@/lib/plans/types';
import {
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
} from './service';
import { GROCERY_HAUL_REMOVE_STORE_RPC_NAME } from './schema';
import {
  buildManualHaulStoreIdentityKey,
  haulStoreLocationLine,
} from './haulStoreIdentity';
import {
  searchHaulStorePlaces,
  type HaulStoreSearchCandidate,
  type HaulStoreSearchResult,
} from './haulStoreSerpApiProvider';

export type { HaulStoreSearchCandidate, HaulStoreSearchResult };

export type GroceryHaulStoreAddInput = {
  source: 'manual' | 'serpapi';
  retailer: string;
  store_name?: string | null;
  store_location?: string | null;
  address_line1?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  provider_place_id?: string | null;
  provider_data_id?: string | null;
  provider_location?: string | null;
};

export type GroceryHaulStoreAddResult = {
  store: GroceryHaulStore;
  outcome: 'created' | 'reused';
};

export type GroceryHaulStoreRemoveResult = {
  store_id: string;
  outcome: 'removed';
  affected_item_count: number;
};

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function mapHaulStore(row: Record<string, unknown>): GroceryHaulStore {
  return {
    id: String(row.id),
    haul_id: String(row.haul_id),
    person_id: String(row.person_id),
    retailer: String(row.retailer),
    store_name: typeof row.store_name === 'string' ? row.store_name : null,
    store_location: typeof row.store_location === 'string' ? row.store_location : null,
    address_line1: typeof row.address_line1 === 'string' ? row.address_line1 : null,
    city: typeof row.city === 'string' ? row.city : null,
    region: typeof row.region === 'string' ? row.region : null,
    postal_code: typeof row.postal_code === 'string' ? row.postal_code : null,
    country_code: typeof row.country_code === 'string' ? row.country_code : null,
    latitude: finiteNumber(row.latitude),
    longitude: finiteNumber(row.longitude),
    source: row.source === 'serpapi' ? 'serpapi' : 'manual',
    provider_place_id: typeof row.provider_place_id === 'string' ? row.provider_place_id : null,
    provider_data_id: typeof row.provider_data_id === 'string' ? row.provider_data_id : null,
    provider_location: typeof row.provider_location === 'string' ? row.provider_location : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function loadOwnedDraftHaul(personId: string, haulId: string): Promise<GroceryHaul> {
  const { data, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('*')
    .eq('id', haulId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery haul: ${error.message}`);
  if (!data) throw new GroceryHaulNotFoundError('Grocery haul not found.');
  if (String(data.status) !== 'planned') {
    throw new GroceryHaulConflictError('Only Draft grocery hauls can be edited.');
  }
  return data as unknown as GroceryHaul;
}

function normalizeAddInput(input: GroceryHaulStoreAddInput): GroceryHaulStoreAddInput {
  const retailer = nullableText(input.retailer);
  if (!retailer) {
    throw new GroceryHaulValidationError('Store / retailer name is required.');
  }
  if (input.source === 'serpapi' && !nullableText(input.provider_place_id)) {
    throw new GroceryHaulValidationError('Provider-backed stores require a place id.');
  }
  return {
    ...input,
    retailer,
    store_name: nullableText(input.store_name),
    store_location: nullableText(input.store_location),
    address_line1: nullableText(input.address_line1),
    city: nullableText(input.city),
    region: nullableText(input.region),
    postal_code: nullableText(input.postal_code),
    country_code: nullableText(input.country_code),
    provider_place_id: nullableText(input.provider_place_id),
    provider_data_id: nullableText(input.provider_data_id),
    provider_location: nullableText(input.provider_location),
  };
}

async function findExistingStore(args: {
  haulId: string;
  personId: string;
  source: 'manual' | 'serpapi';
  providerPlaceId: string | null;
  manualIdentityKey: string | null;
}): Promise<GroceryHaulStore | null> {
  if (args.source === 'serpapi' && args.providerPlaceId) {
    const { data, error } = await supabaseAdmin
      .from('grocery_haul_stores')
      .select('*')
      .eq('haul_id', args.haulId)
      .eq('person_id', args.personId)
      .eq('provider_place_id', args.providerPlaceId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load grocery haul store: ${error.message}`);
    return data ? mapHaulStore(data as Record<string, unknown>) : null;
  }
  if (args.source === 'manual' && args.manualIdentityKey) {
    const { data, error } = await supabaseAdmin
      .from('grocery_haul_stores')
      .select('*')
      .eq('haul_id', args.haulId)
      .eq('person_id', args.personId)
      .eq('manual_identity_key', args.manualIdentityKey)
      .maybeSingle();
    if (error) throw new Error(`Failed to load grocery haul store: ${error.message}`);
    return data ? mapHaulStore(data as Record<string, unknown>) : null;
  }
  return null;
}

export async function addGroceryHaulStore(args: {
  personId: string;
  haulId: string;
  input: GroceryHaulStoreAddInput;
}): Promise<GroceryHaulStoreAddResult> {
  await loadOwnedDraftHaul(args.personId, args.haulId);
  const input = normalizeAddInput(args.input);
  const manualIdentityKey = input.source === 'manual'
    ? buildManualHaulStoreIdentityKey({
        retailer: input.retailer,
        storeLocation: input.store_location,
        postalCode: input.postal_code,
      })
    : null;

  const existing = await findExistingStore({
    haulId: args.haulId,
    personId: args.personId,
    source: input.source,
    providerPlaceId: input.provider_place_id ?? null,
    manualIdentityKey,
  });
  if (existing) {
    return { store: existing, outcome: 'reused' };
  }

  const insertRow = {
    haul_id: args.haulId,
    person_id: args.personId,
    retailer: input.retailer,
    store_name: input.store_name,
    store_location: input.store_location ?? haulStoreLocationLine({
      store_location: input.store_location ?? null,
      address_line1: input.address_line1 ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      postal_code: input.postal_code ?? null,
    }),
    address_line1: input.address_line1,
    city: input.city,
    region: input.region,
    postal_code: input.postal_code,
    country_code: input.country_code,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    source: input.source,
    provider_place_id: input.provider_place_id,
    provider_data_id: input.provider_data_id,
    provider_location: input.provider_location,
    manual_identity_key: manualIdentityKey,
  };

  const { data, error } = await supabaseAdmin
    .from('grocery_haul_stores')
    .insert(insertRow)
    .select('*')
    .single();
  if (error) {
    const existingAfterRace = await findExistingStore({
      haulId: args.haulId,
      personId: args.personId,
      source: input.source,
      providerPlaceId: input.provider_place_id ?? null,
      manualIdentityKey,
    });
    if (existingAfterRace) {
      return { store: existingAfterRace, outcome: 'reused' };
    }
    throw new Error(`Failed to add grocery haul store: ${error.message}`);
  }
  return {
    store: mapHaulStore(data as Record<string, unknown>),
    outcome: 'created',
  };
}

function rpcMessage(error: { message?: string; details?: string }): string {
  return [error.message, error.details].filter(Boolean).join(' ');
}

export async function removeGroceryHaulStore(args: {
  personId: string;
  haulId: string;
  storeId: string;
}): Promise<GroceryHaulStoreRemoveResult> {
  await loadOwnedDraftHaul(args.personId, args.haulId);
  const { data, error } = await supabaseAdmin.rpc(GROCERY_HAUL_REMOVE_STORE_RPC_NAME, {
    p_person_id: args.personId,
    p_haul_id: args.haulId,
    p_store_id: args.storeId,
  });
  if (error) {
    const message = rpcMessage(error);
    if (message.includes('HAUL_STORE_ROSTER_NOT_FOUND')) {
      throw new GroceryHaulNotFoundError('Grocery haul store not found.');
    }
    if (message.includes('HAUL_STORE_ROSTER_NOT_DRAFT')) {
      throw new GroceryHaulConflictError('Only Draft grocery hauls can be edited.');
    }
    if (message.includes('HAUL_STORE_ROSTER_HAUL_NOT_FOUND')) {
      throw new GroceryHaulNotFoundError('Grocery haul not found.');
    }
    throw new Error(`Failed to remove grocery haul store: ${message}`);
  }
  const record = typeof data === 'string' ? JSON.parse(data) : data;
  return {
    store_id: String(record.store_id),
    outcome: 'removed',
    affected_item_count: Number(record.affected_item_count ?? 0),
  };
}

export async function searchGroceryHaulStores(args: {
  query: string;
  locationContext?: string | null;
}): Promise<HaulStoreSearchResult> {
  return searchHaulStorePlaces(args);
}

export async function loadGroceryHaulStoresForDetail(args: {
  personId: string;
  haulId: string;
}): Promise<GroceryHaulStore[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_haul_stores')
    .select('*')
    .eq('haul_id', args.haulId)
    .eq('person_id', args.personId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load grocery haul stores: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapHaulStore);
}

export async function loadOwnedHaulStore(args: {
  personId: string;
  haulId: string;
  storeId: string;
}): Promise<GroceryHaulStore> {
  const { data, error } = await supabaseAdmin
    .from('grocery_haul_stores')
    .select('*')
    .eq('id', args.storeId)
    .eq('haul_id', args.haulId)
    .eq('person_id', args.personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery haul store: ${error.message}`);
  if (!data) throw new GroceryHaulNotFoundError('Grocery haul store not found.');
  return mapHaulStore(data as Record<string, unknown>);
}

export function haulStoreFieldsForItemAssignment(store: GroceryHaulStore): {
  retailer: string;
  store_location: string | null;
  postal_code: string | null;
} {
  return {
    retailer: store.retailer,
    store_location: store.store_location ?? haulStoreLocationLine(store),
    postal_code: store.postal_code,
  };
}
