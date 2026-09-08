/**
 * Pantry acquisition-lot persistence.
 *
 * Lots are additive history beneath pantry_on_hand_items. This module never
 * recalculates or mutates the legacy aggregate quantity/unit contract.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { PantryAcquisitionLot } from './types';

export interface PantryAcquisitionLotWrite {
  acquiredOn: string;
  expiresOn?: string | null;
  expectedShelfLifeDays?: number | null;
  quantityAcquired: number;
  quantityRemaining: number;
  unit?: string | null;
  productTitle?: string | null;
  brandName?: string | null;
  packageSize?: number | null;
  packageUnit?: string | null;
  packageCount?: number | null;
  retailer?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  sourceHaulId?: string | null;
  sourceHaulItemId?: string | null;
}

export type PantryAcquisitionLotUpdate = Partial<PantryAcquisitionLotWrite>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function validateWrite(input: PantryAcquisitionLotWrite): void {
  if (!isCalendarDate(input.acquiredOn)) {
    throw new Error('acquired_on must be a calendar date (YYYY-MM-DD).');
  }
  if (input.expiresOn != null && !isCalendarDate(input.expiresOn)) {
    throw new Error('expires_on must be a calendar date (YYYY-MM-DD) when provided.');
  }
  if (!Number.isFinite(input.quantityAcquired) || input.quantityAcquired <= 0) {
    throw new Error('quantity_acquired must be greater than zero.');
  }
  if (
    !Number.isFinite(input.quantityRemaining)
    || input.quantityRemaining < 0
    || input.quantityRemaining > input.quantityAcquired
  ) {
    throw new Error('quantity_remaining must be between zero and quantity_acquired.');
  }
  if (
    input.expectedShelfLifeDays != null
    && (
      !Number.isInteger(input.expectedShelfLifeDays)
      || input.expectedShelfLifeDays <= 0
    )
  ) {
    throw new Error('expected_shelf_life_days must be a positive integer when provided.');
  }
  if (input.packageSize != null && (!Number.isFinite(input.packageSize) || input.packageSize <= 0)) {
    throw new Error('package_size must be greater than zero when provided.');
  }
  if (input.packageCount != null && (!Number.isFinite(input.packageCount) || input.packageCount <= 0)) {
    throw new Error('package_count must be greater than zero when provided.');
  }
  if (input.priceAmount != null && (!Number.isFinite(input.priceAmount) || input.priceAmount < 0)) {
    throw new Error('price_amount must be non-negative when provided.');
  }
  if (input.currency != null && !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error('currency must be a three-letter uppercase code when provided.');
  }
  if (input.sourceHaulItemId && !input.sourceHaulId) {
    throw new Error('source_haul_id is required when source_haul_item_id is provided.');
  }
}

function rowToLot(
  row: Record<string, unknown>,
  pantryItemKey?: string,
): PantryAcquisitionLot {
  return {
    id: String(row.id),
    pantry_item_id: String(row.pantry_item_id),
    ...(pantryItemKey ? { pantry_item_key: pantryItemKey } : {}),
    person_id: String(row.person_id),
    acquired_on: String(row.acquired_on),
    expires_on: row.expires_on == null ? null : String(row.expires_on),
    expected_shelf_life_days:
      row.expected_shelf_life_days == null ? null : Number(row.expected_shelf_life_days),
    quantity_acquired: Number(row.quantity_acquired),
    quantity_remaining: Number(row.quantity_remaining),
    unit: row.unit == null ? null : String(row.unit),
    product_title: row.product_title == null ? null : String(row.product_title),
    brand_name: row.brand_name == null ? null : String(row.brand_name),
    package_size: row.package_size == null ? null : Number(row.package_size),
    package_unit: row.package_unit == null ? null : String(row.package_unit),
    package_count: row.package_count == null ? null : Number(row.package_count),
    retailer: row.retailer == null ? null : String(row.retailer),
    price_amount: row.price_amount == null ? null : Number(row.price_amount),
    currency: row.currency == null ? null : String(row.currency),
    source_haul_id: row.source_haul_id == null ? null : String(row.source_haul_id),
    source_haul_item_id:
      row.source_haul_item_id == null ? null : String(row.source_haul_item_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function writeToRow(input: PantryAcquisitionLotWrite): Record<string, unknown> {
  return {
    acquired_on: input.acquiredOn,
    expires_on: input.expiresOn ?? null,
    expected_shelf_life_days: input.expectedShelfLifeDays ?? null,
    quantity_acquired: input.quantityAcquired,
    quantity_remaining: input.quantityRemaining,
    unit: input.unit ?? null,
    product_title: input.productTitle ?? null,
    brand_name: input.brandName ?? null,
    package_size: input.packageSize ?? null,
    package_unit: input.packageUnit ?? null,
    package_count: input.packageCount ?? null,
    retailer: input.retailer ?? null,
    price_amount: input.priceAmount ?? null,
    currency: input.currency ?? null,
    source_haul_id: input.sourceHaulId ?? null,
    source_haul_item_id: input.sourceHaulItemId ?? null,
  };
}

async function getPantryItemId(personId: string, pantryItemKey: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .select('id')
    .eq('person_id', personId)
    .eq('key', pantryItemKey)
    .maybeSingle();
  if (error) throw new Error(`Failed to load pantry item: ${error.message}`);
  if (!data) throw new Error('Pantry item not found.');
  return String(data.id);
}

export async function listPantryAcquisitionLots(
  personId: string,
  pantryItemKey?: string,
): Promise<PantryAcquisitionLot[]> {
  let pantryItemId: string | undefined;
  let query = supabaseAdmin
    .from('pantry_acquisition_lots')
    .select('*')
    .eq('person_id', personId);
  if (pantryItemKey) {
    pantryItemId = await getPantryItemId(personId, pantryItemKey);
    query = query.eq('pantry_item_id', pantryItemId);
  }
  const { data, error } = await query.order('acquired_on', { ascending: false });
  if (error) throw new Error(`Failed to load pantry acquisition lots: ${error.message}`);
  if (pantryItemKey) {
    return (data ?? []).map((row) => rowToLot(row as Record<string, unknown>, pantryItemKey));
  }

  const pantryItemIds = Array.from(new Set(
    (data ?? []).map((row) => String((row as Record<string, unknown>).pantry_item_id)),
  ));
  if (pantryItemIds.length === 0) return [];

  // One owner-scoped parent lookup enriches the whole result. This keeps the
  // manager read at two queries regardless of how many Pantry rows are shown.
  const { data: pantryRows, error: pantryError } = await supabaseAdmin
    .from('pantry_on_hand_items')
    .select('id, key')
    .eq('person_id', personId)
    .in('id', pantryItemIds);
  if (pantryError) throw new Error(`Failed to load pantry item keys: ${pantryError.message}`);
  const keyById = new Map(
    (pantryRows ?? []).map((row) => [String(row.id), String(row.key)]),
  );
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return rowToLot(record, keyById.get(String(record.pantry_item_id)));
  });
}

export async function createPantryAcquisitionLot(args: {
  personId: string;
  pantryItemKey: string;
  lot: PantryAcquisitionLotWrite;
}): Promise<PantryAcquisitionLot> {
  validateWrite(args.lot);
  const pantryItemId = await getPantryItemId(args.personId, args.pantryItemKey);
  const { data, error } = await supabaseAdmin
    .from('pantry_acquisition_lots')
    .insert({
      pantry_item_id: pantryItemId,
      person_id: args.personId,
      ...writeToRow(args.lot),
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to create pantry acquisition lot: ${error?.message ?? 'no row returned'}`);
  }
  return rowToLot(data as Record<string, unknown>, args.pantryItemKey);
}

export async function updatePantryAcquisitionLot(args: {
  personId: string;
  lotId: string;
  patch: PantryAcquisitionLotUpdate;
}): Promise<PantryAcquisitionLot> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('pantry_acquisition_lots')
    .select('*')
    .eq('id', args.lotId)
    .eq('person_id', args.personId)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to load pantry acquisition lot: ${existingError.message}`);
  if (!existing) throw new Error('Pantry acquisition lot not found.');

  const current = rowToLot(existing as Record<string, unknown>);
  const merged: PantryAcquisitionLotWrite = {
    acquiredOn: args.patch.acquiredOn ?? current.acquired_on,
    expiresOn: args.patch.expiresOn === undefined ? current.expires_on : args.patch.expiresOn,
    expectedShelfLifeDays:
      args.patch.expectedShelfLifeDays === undefined
        ? current.expected_shelf_life_days
        : args.patch.expectedShelfLifeDays,
    quantityAcquired: args.patch.quantityAcquired ?? current.quantity_acquired,
    quantityRemaining: args.patch.quantityRemaining ?? current.quantity_remaining,
    unit: args.patch.unit === undefined ? current.unit : args.patch.unit,
    productTitle:
      args.patch.productTitle === undefined ? current.product_title : args.patch.productTitle,
    brandName: args.patch.brandName === undefined ? current.brand_name : args.patch.brandName,
    packageSize: args.patch.packageSize === undefined ? current.package_size : args.patch.packageSize,
    packageUnit: args.patch.packageUnit === undefined ? current.package_unit : args.patch.packageUnit,
    packageCount:
      args.patch.packageCount === undefined ? current.package_count : args.patch.packageCount,
    retailer: args.patch.retailer === undefined ? current.retailer : args.patch.retailer,
    priceAmount: args.patch.priceAmount === undefined ? current.price_amount : args.patch.priceAmount,
    currency: args.patch.currency === undefined ? current.currency : args.patch.currency,
    sourceHaulId:
      args.patch.sourceHaulId === undefined ? current.source_haul_id : args.patch.sourceHaulId,
    sourceHaulItemId:
      args.patch.sourceHaulItemId === undefined
        ? current.source_haul_item_id
        : args.patch.sourceHaulItemId,
  };
  validateWrite(merged);

  const { data, error } = await supabaseAdmin
    .from('pantry_acquisition_lots')
    .update(writeToRow(merged))
    .eq('id', args.lotId)
    .eq('person_id', args.personId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to update pantry acquisition lot: ${error?.message ?? 'not found'}`);
  }
  return rowToLot(data as Record<string, unknown>);
}

export async function deletePantryAcquisitionLot(
  personId: string,
  lotId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('pantry_acquisition_lots')
    .delete()
    .eq('id', lotId)
    .eq('person_id', personId)
    .select('id');
  if (error) throw new Error(`Failed to delete pantry acquisition lot: ${error.message}`);
  return (data ?? []).length > 0;
}
