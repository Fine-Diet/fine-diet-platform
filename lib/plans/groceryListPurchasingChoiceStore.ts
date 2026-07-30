/**
 * Store for grocery_list_purchasing_choices (list-scoped shopping identity).
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { GroceryListPurchasingChoice, GroceryListPurchasingChoiceStatus } from './types';

interface ChoiceRow {
  id: string;
  grocery_list_id: string;
  grocery_item_id: string;
  person_id: string;
  match_key: string;
  status: GroceryListPurchasingChoiceStatus;
  food_object_id: string | null;
  shopping_display_name: string | null;
  purchase_quantity: number | string | null;
  purchase_unit: string | null;
  preferred_product: string | null;
  aisle_category: string | null;
  note: string | null;
  required_name_snapshot: string;
  required_unit_snapshot: string | null;
  source_plan_id: string | null;
  source_date_range_start: string | null;
  source_date_range_end: string | null;
  applied_to_person_resolution_at: string | null;
  applied_to_plan_override_id: string | null;
  suggested_by_person_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToChoice(row: ChoiceRow): GroceryListPurchasingChoice {
  const quantity =
    typeof row.purchase_quantity === 'string'
      ? Number(row.purchase_quantity)
      : row.purchase_quantity;
  return {
    id: row.id,
    grocery_list_id: row.grocery_list_id,
    grocery_item_id: row.grocery_item_id,
    person_id: row.person_id,
    match_key: row.match_key,
    status: row.status,
    food_object_id: row.food_object_id,
    shopping_display_name: row.shopping_display_name,
    purchase_quantity:
      typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null,
    purchase_unit: row.purchase_unit,
    preferred_product: row.preferred_product,
    aisle_category: row.aisle_category,
    note: row.note,
    required_name_snapshot: row.required_name_snapshot,
    required_unit_snapshot: row.required_unit_snapshot,
    source_plan_id: row.source_plan_id,
    source_date_range_start: row.source_date_range_start,
    source_date_range_end: row.source_date_range_end,
    applied_to_person_resolution_at: row.applied_to_person_resolution_at,
    applied_to_plan_override_id: row.applied_to_plan_override_id,
    suggested_by_person_id: row.suggested_by_person_id,
    reviewed_at: row.reviewed_at,
    review_note: row.review_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listPurchasingChoicesForList(
  personId: string,
  listId: string,
): Promise<GroceryListPurchasingChoice[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_purchasing_choices')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_list_id', listId)
    .neq('status', 'unresolved')
    .order('updated_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list grocery list purchasing choices: ${error.message}`);
  }
  return (data ?? []).map((row) => rowToChoice(row as ChoiceRow));
}

export async function getPurchasingChoiceForItem(
  personId: string,
  listId: string,
  itemId: string,
): Promise<GroceryListPurchasingChoice | null> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_purchasing_choices')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_list_id', listId)
    .eq('grocery_item_id', itemId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load grocery list purchasing choice: ${error.message}`);
  }
  return data ? rowToChoice(data as ChoiceRow) : null;
}

export type UpsertPurchasingChoiceInput = {
  grocery_list_id: string;
  grocery_item_id: string;
  person_id: string;
  match_key: string;
  status: GroceryListPurchasingChoiceStatus;
  food_object_id: string | null;
  shopping_display_name: string | null;
  purchase_quantity?: number | null;
  purchase_unit?: string | null;
  preferred_product?: string | null;
  aisle_category?: string | null;
  note?: string | null;
  required_name_snapshot: string;
  required_unit_snapshot: string | null;
  source_plan_id?: string | null;
  source_date_range_start?: string | null;
  source_date_range_end?: string | null;
  applied_to_person_resolution_at?: string | null;
  applied_to_plan_override_id?: string | null;
};

export async function upsertPurchasingChoice(
  input: UpsertPurchasingChoiceInput,
): Promise<GroceryListPurchasingChoice> {
  const payload = {
    grocery_list_id: input.grocery_list_id,
    grocery_item_id: input.grocery_item_id,
    person_id: input.person_id,
    match_key: input.match_key,
    status: input.status,
    food_object_id: input.food_object_id,
    shopping_display_name: input.shopping_display_name,
    purchase_quantity: input.purchase_quantity ?? null,
    purchase_unit: input.purchase_unit ?? null,
    preferred_product: input.preferred_product ?? null,
    aisle_category: input.aisle_category ?? null,
    note: input.note ?? null,
    required_name_snapshot: input.required_name_snapshot,
    required_unit_snapshot: input.required_unit_snapshot,
    source_plan_id: input.source_plan_id ?? null,
    source_date_range_start: input.source_date_range_start ?? null,
    source_date_range_end: input.source_date_range_end ?? null,
    applied_to_person_resolution_at: input.applied_to_person_resolution_at ?? null,
    applied_to_plan_override_id: input.applied_to_plan_override_id ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('grocery_list_purchasing_choices')
    .upsert(payload, { onConflict: 'grocery_list_id,grocery_item_id' })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to upsert grocery list purchasing choice: ${error?.message ?? 'unknown'}`);
  }
  return rowToChoice(data as ChoiceRow);
}

export async function deletePurchasingChoice(
  personId: string,
  listId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('grocery_list_purchasing_choices')
    .delete()
    .eq('person_id', personId)
    .eq('grocery_list_id', listId)
    .eq('grocery_item_id', itemId);
  if (error) {
    throw new Error(`Failed to delete grocery list purchasing choice: ${error.message}`);
  }
}

export async function patchPurchasingChoiceOptInReceipts(
  personId: string,
  choiceId: string,
  patch: {
    applied_to_person_resolution_at?: string | null;
    applied_to_plan_override_id?: string | null;
  },
): Promise<GroceryListPurchasingChoice> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_purchasing_choices')
    .update(patch)
    .eq('id', choiceId)
    .eq('person_id', personId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to update purchasing choice receipts: ${error?.message ?? 'not found'}`);
  }
  return rowToChoice(data as ChoiceRow);
}
