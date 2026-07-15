/**
 * Packet 3 — table-backed grocery shopping override storage.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { GroceryShoppingOverride, GroceryShoppingOverrideMatchStatus } from './types';

export interface GroceryListScope {
  planId: string;
  dateStart: string;
  dateEnd: string;
}

interface GroceryShoppingOverrideRow {
  id: string;
  person_id: string;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  unresolved_name: string | null;
  unresolved_unit: string | null;
  shopping_display_name: string | null;
  purchase_quantity: number | string | null;
  purchase_unit: string | null;
  preferred_product: string | null;
  aisle_category: string | null;
  note: string | null;
  match_status: GroceryShoppingOverrideMatchStatus;
  created_at: string;
  updated_at: string;
}

function rowToOverride(row: GroceryShoppingOverrideRow): GroceryShoppingOverride {
  const quantity =
    typeof row.purchase_quantity === 'string'
      ? Number(row.purchase_quantity)
      : row.purchase_quantity;
  return {
    id: row.id,
    person_id: row.person_id,
    plan_id: row.plan_id,
    date_range_start: row.date_range_start,
    date_range_end: row.date_range_end,
    match_key: row.match_key,
    food_object_id: row.food_object_id,
    unresolved_name: row.unresolved_name,
    unresolved_unit: row.unresolved_unit,
    shopping_display_name: row.shopping_display_name,
    purchase_quantity:
      typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null,
    purchase_unit: row.purchase_unit,
    preferred_product: row.preferred_product,
    aisle_category: row.aisle_category,
    note: row.note,
    match_status: row.match_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listShoppingOverridesForScope(
  personId: string,
  scope: GroceryListScope,
): Promise<GroceryShoppingOverride[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_shopping_overrides')
    .select('*')
    .eq('person_id', personId)
    .eq('plan_id', scope.planId)
    .eq('date_range_start', scope.dateStart)
    .eq('date_range_end', scope.dateEnd)
    .neq('match_status', 'retired')
    .order('updated_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list grocery shopping overrides: ${error.message}`);
  }
  return (data ?? []).map((row) => rowToOverride(row as GroceryShoppingOverrideRow));
}

export async function getShoppingOverrideByMatchKey(
  personId: string,
  scope: GroceryListScope,
  matchKey: string,
): Promise<GroceryShoppingOverride | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_shopping_overrides')
    .select('*')
    .eq('person_id', personId)
    .eq('plan_id', scope.planId)
    .eq('date_range_start', scope.dateStart)
    .eq('date_range_end', scope.dateEnd)
    .eq('match_key', matchKey)
    .neq('match_status', 'retired')
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load grocery shopping override: ${error.message}`);
  }
  return data ? rowToOverride(data as GroceryShoppingOverrideRow) : null;
}

export interface SaveShoppingOverrideInput {
  match_key: string;
  food_object_id: string | null;
  unresolved_name: string | null;
  unresolved_unit: string | null;
  shopping_display_name: string | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  preferred_product: string | null;
  aisle_category: string | null;
  note: string | null;
}

export async function saveShoppingOverride(
  personId: string,
  scope: GroceryListScope,
  input: SaveShoppingOverrideInput,
): Promise<GroceryShoppingOverride> {
  const { data, error } = await supabaseAdmin
    .from('grocery_shopping_overrides')
    .upsert(
      {
        person_id: personId,
        plan_id: scope.planId,
        date_range_start: scope.dateStart,
        date_range_end: scope.dateEnd,
        match_key: input.match_key,
        food_object_id: input.food_object_id,
        unresolved_name: input.unresolved_name,
        unresolved_unit: input.unresolved_unit,
        shopping_display_name: input.shopping_display_name,
        purchase_quantity: input.purchase_quantity,
        purchase_unit: input.purchase_unit,
        preferred_product: input.preferred_product,
        aisle_category: input.aisle_category,
        note: input.note,
        match_status: 'active',
      },
      { onConflict: 'person_id,plan_id,date_range_start,date_range_end,match_key' },
    )
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to save grocery shopping override: ${error?.message ?? 'no data'}`);
  }
  return rowToOverride(data as GroceryShoppingOverrideRow);
}

export async function clearShoppingOverride(
  personId: string,
  scope: GroceryListScope,
  matchKey: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('grocery_shopping_overrides')
    .delete()
    .eq('person_id', personId)
    .eq('plan_id', scope.planId)
    .eq('date_range_start', scope.dateStart)
    .eq('date_range_end', scope.dateEnd)
    .eq('match_key', matchKey)
    .select('id');
  if (error) {
    throw new Error(`Failed to clear grocery shopping override: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

export async function retireShoppingOverride(
  personId: string,
  overrideId: string,
): Promise<GroceryShoppingOverride> {
  const { data, error } = await supabaseAdmin
    .from('grocery_shopping_overrides')
    .update({ match_status: 'retired' })
    .eq('person_id', personId)
    .eq('id', overrideId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to retire grocery shopping override: ${error?.message ?? 'not found'}`);
  }
  return rowToOverride(data as GroceryShoppingOverrideRow);
}

export async function setShoppingOverrideMatchStatuses(
  personId: string,
  scope: GroceryListScope,
  updates: Array<{ match_key: string; match_status: GroceryShoppingOverrideMatchStatus }>,
): Promise<void> {
  for (const update of updates) {
    const { error } = await supabaseAdmin
      .from('grocery_shopping_overrides')
      .update({ match_status: update.match_status })
      .eq('person_id', personId)
      .eq('plan_id', scope.planId)
      .eq('date_range_start', scope.dateStart)
      .eq('date_range_end', scope.dateEnd)
      .eq('match_key', update.match_key);
    if (error) {
      throw new Error(`Failed to update override match status: ${error.message}`);
    }
  }
}
