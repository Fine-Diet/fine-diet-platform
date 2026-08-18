/**
 * Packet 57 — table-backed grocery-state storage.
 *
 * Authoritative storage: dedicated grocery-state tables.
 *
 * Legacy people.metadata collections are a non-destructive compatibility
 * source only. Reads are deterministic: table rows win by (person_id, key),
 * missing valid metadata rows are copied into tables with
 * storage_source='legacy_metadata', then callers receive table rows only. New
 * writes never update legacy metadata.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  normalizeMetadataCollection,
  readPersonMetadata,
} from './personMetadataStore';
import { PANTRY_IF_ABSENT_UPSERT, resolvePantryIfAbsentWrite } from './pantryIfAbsent';
import type { PantryOnHandItem } from './types';

const GROCERY_RESOLUTIONS_METADATA_KEY = 'grocery_ingredient_resolutions';
const PANTRY_ON_HAND_METADATA_KEY = 'pantry_on_hand_items';
const TABLE_DIRECT_STORAGE_SOURCE = 'table_direct';
const LEGACY_METADATA_STORAGE_SOURCE = 'legacy_metadata';

const PANTRY_UNIT_ALIASES: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsp: 'tsp',
  tsps: 'tsp',
  gram: 'g',
  grams: 'g',
  g: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  oz: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lb: 'lb',
  lbs: 'lb',
  serving: 'serving',
  servings: 'serving',
  item: 'item',
  items: 'item',
  each: 'item',
  ea: 'item',
};

type MigratedStorageSource =
  | typeof TABLE_DIRECT_STORAGE_SOURCE
  | typeof LEGACY_METADATA_STORAGE_SOURCE;

export interface GroceryIngredientResolution {
  key: string;
  raw_name: string;
  unit: string | null;
  food_object_id: string;
  canonical_name: string;
  created_at: string;
  updated_at: string;
}

interface GroceryIngredientResolutionRow extends GroceryIngredientResolution {
  id: string;
  person_id: string;
  storage_source?: MigratedStorageSource;
  legacy_metadata_backfilled_at?: string | null;
}

interface PantryOnHandItemRow extends Omit<PantryOnHandItem, 'quantity'> {
  id: string;
  person_id: string;
  quantity: number | string | null;
  storage_source?: MigratedStorageSource;
  legacy_metadata_backfilled_at?: string | null;
  created_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function normalizePantryOnHandUnit(unit: string | null | undefined): string | null {
  const raw = (unit ?? '').toLowerCase().trim().replace(/\.$/, '');
  if (!raw) return null;
  return PANTRY_UNIT_ALIASES[raw] ?? raw;
}

export function pantryOnHandKey(
  foodObjectId: string,
  unit: string | null | undefined,
): string {
  return `${foodObjectId}::${normalizePantryOnHandUnit(unit) ?? ''}`;
}

function isGroceryIngredientResolution(value: unknown): value is GroceryIngredientResolution {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<GroceryIngredientResolution>;
  return (
    typeof candidate.key === 'string' &&
    candidate.key.length > 0 &&
    typeof candidate.raw_name === 'string' &&
    candidate.raw_name.length > 0 &&
    (typeof candidate.unit === 'string' || candidate.unit === null) &&
    isUuid(candidate.food_object_id) &&
    typeof candidate.canonical_name === 'string' &&
    candidate.canonical_name.length > 0 &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function normalizeResolutions(value: unknown): GroceryIngredientResolution[] {
  return normalizeMetadataCollection(
    GROCERY_RESOLUTIONS_METADATA_KEY,
    value,
    isGroceryIngredientResolution,
  );
}

function isPantryOnHandItem(value: unknown): value is PantryOnHandItem {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<PantryOnHandItem>;
  return (
    typeof candidate.key === 'string' &&
    candidate.key.length > 0 &&
    isUuid(candidate.food_object_id) &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    (typeof candidate.quantity === 'number' || candidate.quantity === null) &&
    (typeof candidate.unit === 'string' || candidate.unit === null) &&
    typeof candidate.updated_at === 'string'
  );
}

function normalizePantryOnHandItems(value: unknown): PantryOnHandItem[] {
  return normalizeMetadataCollection(
    PANTRY_ON_HAND_METADATA_KEY,
    value,
    isPantryOnHandItem,
  );
}

function rowToResolution(row: GroceryIngredientResolutionRow): GroceryIngredientResolution {
  const resolution: GroceryIngredientResolution = {
    key: row.key,
    raw_name: row.raw_name,
    unit: row.unit,
    food_object_id: row.food_object_id,
    canonical_name: row.canonical_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (!isGroceryIngredientResolution(resolution)) {
    throw new Error('Stored grocery ingredient resolution has an invalid shape.');
  }
  return resolution;
}

function rowToPantryItem(row: PantryOnHandItemRow): PantryOnHandItem {
  const quantity =
    typeof row.quantity === 'string'
      ? Number(row.quantity)
      : row.quantity;
  const item: PantryOnHandItem = {
    key: row.key,
    food_object_id: row.food_object_id,
    name: row.name,
    quantity: typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null,
    unit: row.unit,
    updated_at: row.updated_at,
  };
  if (!isPantryOnHandItem(item)) {
    throw new Error('Stored pantry on-hand item has an invalid shape.');
  }
  return item;
}

async function readResolutionRows(personId: string): Promise<GroceryIngredientResolutionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_ingredient_resolutions')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list grocery ingredient resolutions: ${error.message}`);
  return (data ?? []) as GroceryIngredientResolutionRow[];
}

async function readPantryRows(personId: string): Promise<PantryOnHandItemRow[]> {
  const { data, error } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list pantry on-hand items: ${error.message}`);
  return (data ?? []) as PantryOnHandItemRow[];
}

async function filterRowsWithExistingFoodObjects<T extends { food_object_id: string }>(
  rows: T[],
): Promise<T[]> {
  const foodObjectIds = Array.from(new Set(rows.map((row) => row.food_object_id)));
  if (foodObjectIds.length === 0) return rows;

  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select('id')
    .in('id', foodObjectIds);
  if (error) throw new Error(`Failed to validate grocery-state food objects: ${error.message}`);

  const existingIds = new Set((data ?? []).map((row) => String(row.id)));
  return rows.filter((row) => existingIds.has(row.food_object_id));
}

async function readRevokedResolutionKeys(personId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('grocery_ingredient_resolution_revocations')
    .select('key')
    .eq('person_id', personId);
  if (error) {
    throw new Error(`Failed to list revoked grocery ingredient resolutions: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => String(row.key)));
}

async function clearResolutionRevocation(personId: string, key: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('grocery_ingredient_resolution_revocations')
    .delete()
    .eq('person_id', personId)
    .eq('key', key);
  if (error) {
    throw new Error(`Failed to clear grocery ingredient resolution revocation: ${error.message}`);
  }
}

async function backfillResolutionsFromMetadata(
  personId: string,
  existingRows: GroceryIngredientResolutionRow[],
): Promise<boolean> {
  const meta = await readPersonMetadata(personId);
  const legacy = normalizeResolutions(meta[GROCERY_RESOLUTIONS_METADATA_KEY]);
  const existingKeys = new Set(existingRows.map((row) => row.key));
  const revokedKeys = await readRevokedResolutionKeys(personId);
  const missing = await filterRowsWithExistingFoodObjects(
    legacy
      .filter((resolution) => !existingKeys.has(resolution.key))
      .filter((resolution) => !revokedKeys.has(resolution.key))
      .map((resolution) => ({
        person_id: personId,
        ...resolution,
        storage_source: LEGACY_METADATA_STORAGE_SOURCE,
        legacy_metadata_backfilled_at: new Date().toISOString(),
      })),
  );
  if (missing.length === 0) return false;

  const { error } = await supabaseAdmin
    .from('grocery_ingredient_resolutions')
    .upsert(missing, { onConflict: 'person_id,key', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to backfill grocery ingredient resolutions: ${error.message}`);
  return true;
}

async function backfillPantryFromMetadata(
  personId: string,
  existingRows: PantryOnHandItemRow[],
): Promise<boolean> {
  const meta = await readPersonMetadata(personId);
  const legacy = normalizePantryOnHandItems(meta[PANTRY_ON_HAND_METADATA_KEY]);
  const existingKeys = new Set(existingRows.map((row) => row.key));
  const missing = await filterRowsWithExistingFoodObjects(
    legacy
      .filter((item) => !existingKeys.has(item.key))
      .map((item) => ({
        person_id: personId,
        ...item,
        storage_source: LEGACY_METADATA_STORAGE_SOURCE,
        legacy_metadata_backfilled_at: new Date().toISOString(),
      })),
  );
  if (missing.length === 0) return false;

  const { error } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .upsert(missing, { onConflict: 'person_id,key', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to backfill pantry on-hand items: ${error.message}`);
  return true;
}

export async function listGroceryIngredientResolutions(
  personId: string,
): Promise<GroceryIngredientResolution[]> {
  const initialRows = await readResolutionRows(personId);
  const backfilled = await backfillResolutionsFromMetadata(personId, initialRows);
  const rows = backfilled ? await readResolutionRows(personId) : initialRows;
  return rows.map(rowToResolution);
}

export async function saveGroceryIngredientResolution(
  personId: string,
  resolution: GroceryIngredientResolution,
): Promise<void> {
  if (!isGroceryIngredientResolution(resolution)) {
    throw new Error('Grocery ingredient resolution contains malformed records.');
  }
  await clearResolutionRevocation(personId, resolution.key);
  const { error } = await supabaseAdmin
    .from('grocery_ingredient_resolutions')
    .upsert(
      {
        person_id: personId,
        ...resolution,
        storage_source: TABLE_DIRECT_STORAGE_SOURCE,
        legacy_metadata_backfilled_at: null,
      },
      { onConflict: 'person_id,key' },
    );
  if (error) throw new Error(`Failed to save grocery ingredient resolution: ${error.message}`);
}

export async function revokeGroceryIngredientResolution(
  personId: string,
  key: string,
): Promise<void> {
  const { error: deleteErr } = await supabaseAdmin
    .from('grocery_ingredient_resolutions')
    .delete()
    .eq('person_id', personId)
    .eq('key', key);
  if (deleteErr) {
    throw new Error(`Failed to delete grocery ingredient resolution: ${deleteErr.message}`);
  }

  const { error: revokeErr } = await supabaseAdmin
    .from('grocery_ingredient_resolution_revocations')
    .upsert(
      {
        person_id: personId,
        key,
        revoked_at: new Date().toISOString(),
      },
      { onConflict: 'person_id,key' },
    );
  if (revokeErr) {
    throw new Error(`Failed to revoke grocery ingredient resolution: ${revokeErr.message}`);
  }
}

export async function listPantryOnHandItems(personId: string): Promise<PantryOnHandItem[]> {
  const initialRows = await readPantryRows(personId);
  const backfilled = await backfillPantryFromMetadata(personId, initialRows);
  const rows = backfilled ? await readPantryRows(personId) : initialRows;
  return rows.map(rowToPantryItem);
}

export async function getPantryOnHandItemByKey(
  personId: string,
  key: string,
): Promise<PantryOnHandItem | null> {
  const { data, error } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .select('*')
    .eq('person_id', personId)
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`Failed to load pantry on-hand item: ${error.message}`);
  if (!data) return null;
  return rowToPantryItem(data as PantryOnHandItemRow);
}

export async function savePantryOnHandItem(
  personId: string,
  item: PantryOnHandItem,
): Promise<void> {
  if (!isPantryOnHandItem(item)) {
    throw new Error('Pantry on-hand item contains malformed records.');
  }
  const { error } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .upsert(
      {
        person_id: personId,
        ...item,
        storage_source: TABLE_DIRECT_STORAGE_SOURCE,
        legacy_metadata_backfilled_at: null,
      },
      { onConflict: 'person_id,key' },
    );
  if (error) throw new Error(`Failed to save pantry on-hand item: ${error.message}`);
}

/**
 * Insert a pantry row only if (person_id, key) is absent. Unique-key conflict
 * ignores the payload so existing quantity/unit cannot be overwritten.
 */
export async function insertPantryOnHandItemIfAbsent(
  personId: string,
  item: PantryOnHandItem,
): Promise<{ item: PantryOnHandItem; created: boolean }> {
  if (!isPantryOnHandItem(item)) {
    throw new Error('Pantry on-hand item contains malformed records.');
  }
  const { data, error } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .upsert(
      {
        person_id: personId,
        ...item,
        storage_source: TABLE_DIRECT_STORAGE_SOURCE,
        legacy_metadata_backfilled_at: null,
      },
      PANTRY_IF_ABSENT_UPSERT,
    )
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to save pantry on-hand item: ${error.message}`);

  const inserted = data ? rowToPantryItem(data as PantryOnHandItemRow) : null;
  const existing = inserted ? null : await getPantryOnHandItemByKey(personId, item.key);
  return resolvePantryIfAbsentWrite({
    attempted: item,
    inserted,
    existing,
  });
}

export async function updatePantryOnHandItem(
  personId: string,
  key: string,
  input: { quantity: number; unit?: string | null },
): Promise<PantryOnHandItem> {
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new Error('Pantry quantity must be a non-negative number.');
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .select('*')
    .eq('person_id', personId)
    .eq('key', key)
    .maybeSingle();
  if (existingErr) throw new Error(`Failed to load pantry on-hand item: ${existingErr.message}`);
  if (!existing) throw new Error('Pantry on-hand item not found.');

  const current = existing as PantryOnHandItemRow;
  const nextUnit = normalizePantryOnHandUnit(input.unit ?? current.unit);
  const nextKey = pantryOnHandKey(current.food_object_id, nextUnit);

  if (nextKey !== key) {
    const { data: conflict, error: conflictErr } = await supabaseAdmin
      .from('pantry_on_hand_items')
      .select('key')
      .eq('person_id', personId)
      .eq('key', nextKey)
      .maybeSingle();
    if (conflictErr) {
      throw new Error(`Failed to check pantry on-hand item conflict: ${conflictErr.message}`);
    }
    if (conflict) {
      throw new Error('A pantry row already exists for this item and unit.');
    }
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .update({
      key: nextKey,
      quantity: Math.round(input.quantity * 1000) / 1000,
      unit: nextUnit,
      storage_source: TABLE_DIRECT_STORAGE_SOURCE,
      legacy_metadata_backfilled_at: null,
    })
    .eq('person_id', personId)
    .eq('key', key)
    .select('*')
    .single();
  if (updateErr || !updated) {
    throw new Error(`Failed to update pantry on-hand item: ${updateErr?.message ?? 'not found'}`);
  }
  return rowToPantryItem(updated as PantryOnHandItemRow);
}

export async function deletePantryOnHandItem(
  personId: string,
  key: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .delete()
    .eq('person_id', personId)
    .eq('key', key)
    .select('key');
  if (error) throw new Error(`Failed to delete pantry on-hand item: ${error.message}`);
  return (data ?? []).length > 0;
}
