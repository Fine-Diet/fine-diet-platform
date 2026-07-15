/**
 * Packet 3 — shopping override matching, persistence, and regeneration.
 */

import type {
  GroceryItem,
  GroceryShoppingOverride,
  GroceryShoppingOverrideBundle,
} from './types';
import { buildShoppingOverrideBundle } from './groceryShoppingOverrideMatching';
import { groceryItemMatchKey } from './groceryMatchKeys';
import {
  clearShoppingOverride,
  getShoppingOverrideByMatchKey,
  listShoppingOverridesForScope,
  retireShoppingOverride,
  saveShoppingOverride,
  setShoppingOverrideMatchStatuses,
  type GroceryListScope,
  type SaveShoppingOverrideInput,
} from './groceryShoppingOverrideStore';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export interface SaveGroceryShoppingDetailsInput {
  shopping_display_name?: string | null;
  purchase_quantity?: number | null;
  purchase_unit?: string | null;
  preferred_product?: string | null;
  aisle_category?: string | null;
  note?: string | null;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasShoppingContent(input: SaveGroceryShoppingDetailsInput): boolean {
  return !!(
    trimOrNull(input.shopping_display_name ?? null) ||
    (input.purchase_quantity != null && Number.isFinite(input.purchase_quantity)) ||
    trimOrNull(input.purchase_unit ?? null) ||
    trimOrNull(input.preferred_product ?? null) ||
    trimOrNull(input.aisle_category ?? null) ||
    trimOrNull(input.note ?? null)
  );
}

export async function loadShoppingOverridesForItems(
  personId: string,
  scope: GroceryListScope,
  items: Array<Pick<GroceryItem, 'food_object_id' | 'name' | 'unit'>>,
): Promise<GroceryShoppingOverrideBundle> {
  const overrides = await listShoppingOverridesForScope(personId, scope);
  const activeMatchKeys = new Set(items.map((item) => groceryItemMatchKey(item)));
  return buildShoppingOverrideBundle(overrides, activeMatchKeys);
}

export async function reconcileShoppingOverridesAfterRegeneration(
  personId: string,
  scope: GroceryListScope,
  items: Array<Pick<GroceryItem, 'food_object_id' | 'name' | 'unit'>>,
): Promise<GroceryShoppingOverrideBundle> {
  const overrides = await listShoppingOverridesForScope(personId, scope);
  const activeMatchKeys = new Set(items.map((item) => groceryItemMatchKey(item)));
  const statusUpdates: Array<{ match_key: string; match_status: 'active' | 'unmatched' }> = [];

  for (const override of overrides) {
    const nextStatus = activeMatchKeys.has(override.match_key) ? 'active' : 'unmatched';
    if (override.match_status !== nextStatus) {
      statusUpdates.push({ match_key: override.match_key, match_status: nextStatus });
    }
  }

  if (statusUpdates.length > 0) {
    await setShoppingOverrideMatchStatuses(personId, scope, statusUpdates);
  }

  const refreshed = statusUpdates.length > 0
    ? await listShoppingOverridesForScope(personId, scope)
    : overrides;

  return buildShoppingOverrideBundle(refreshed, activeMatchKeys);
}

async function loadGroceryItemScope(
  personId: string,
  itemId: string,
): Promise<{ item: GroceryItem; scope: GroceryListScope }> {
  const { data: item, error: itemErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('person_id', personId)
    .single();
  if (itemErr || !item) {
    throw new Error(`Failed to load grocery item: ${itemErr?.message ?? 'not found'}`);
  }

  const { data: list, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('plan_id, date_range_start, date_range_end')
    .eq('id', item.grocery_list_id)
    .eq('person_id', personId)
    .single();
  if (listErr || !list?.plan_id || !list.date_range_start || !list.date_range_end) {
    throw new Error(`Failed to load grocery list scope: ${listErr?.message ?? 'not found'}`);
  }

  return {
    item: item as unknown as GroceryItem,
    scope: {
      planId: list.plan_id,
      dateStart: list.date_range_start,
      dateEnd: list.date_range_end,
    },
  };
}

export async function saveGroceryShoppingDetails(options: {
  personId: string;
  itemId: string;
  input: SaveGroceryShoppingDetailsInput;
}): Promise<GroceryShoppingOverride | null> {
  const { personId, itemId, input } = options;
  if (!hasShoppingContent(input)) {
    throw new Error('Provide at least one shopping detail to save.');
  }

  const { item, scope } = await loadGroceryItemScope(personId, itemId);
  const matchKey = groceryItemMatchKey(item);

  const purchaseQuantity =
    input.purchase_quantity == null
      ? null
      : Number.isFinite(input.purchase_quantity) && input.purchase_quantity >= 0
        ? Math.round(input.purchase_quantity * 1000) / 1000
        : null;

  const payload: SaveShoppingOverrideInput = {
    match_key: matchKey,
    food_object_id: item.food_object_id,
    unresolved_name: item.food_object_id ? null : item.name,
    unresolved_unit: item.unit,
    shopping_display_name: trimOrNull(input.shopping_display_name ?? null),
    purchase_quantity: purchaseQuantity,
    purchase_unit: trimOrNull(input.purchase_unit ?? null),
    preferred_product: trimOrNull(input.preferred_product ?? null),
    aisle_category: trimOrNull(input.aisle_category ?? null) ?? item.aisle_category,
    note: trimOrNull(input.note ?? null),
  };

  return saveShoppingOverride(personId, scope, payload);
}

export async function clearGroceryShoppingDetails(options: {
  personId: string;
  itemId: string;
}): Promise<boolean> {
  const { personId, itemId } = options;
  const { item, scope } = await loadGroceryItemScope(personId, itemId);
  return clearShoppingOverride(personId, scope, groceryItemMatchKey(item));
}

export async function clearUnmatchedShoppingOverride(options: {
  personId: string;
  overrideId: string;
}): Promise<GroceryShoppingOverride> {
  return retireShoppingOverride(options.personId, options.overrideId);
}

export async function getGroceryShoppingOverrideForItem(options: {
  personId: string;
  itemId: string;
}): Promise<GroceryShoppingOverride | null> {
  const { personId, itemId } = options;
  const { item, scope } = await loadGroceryItemScope(personId, itemId);
  return getShoppingOverrideByMatchKey(personId, scope, groceryItemMatchKey(item));
}
