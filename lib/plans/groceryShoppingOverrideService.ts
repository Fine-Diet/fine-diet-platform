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
  listShoppingOverridesOverlappingScope,
  listShoppingOverridesForScope,
  retireShoppingOverride,
  saveShoppingOverride,
  setShoppingOverrideMatchStatuses,
  type GroceryListScope,
  type SaveShoppingOverrideInput,
} from './groceryShoppingOverrideStore';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  normalizeSaveGroceryShoppingDetailsInput,
  type SaveGroceryShoppingDetailsInput,
} from './groceryShoppingOverrideValidation';

export type { SaveGroceryShoppingDetailsInput } from './groceryShoppingOverrideValidation';
export { ShoppingOverrideValidationError } from './groceryShoppingOverrideValidation';

export async function loadShoppingOverridesForItems(
  personId: string,
  scope: GroceryListScope,
  items: Array<Pick<GroceryItem, 'food_object_id' | 'name' | 'unit'>>,
): Promise<GroceryShoppingOverrideBundle> {
  const overrides = await listShoppingOverridesOverlappingScope(personId, scope);
  const activeMatchKeys = new Set(items.map((item) => groceryItemMatchKey(item)));
  return buildShoppingOverrideBundle(overrides, activeMatchKeys, scope);
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

  return buildShoppingOverrideBundle(refreshed, activeMatchKeys, scope);
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
  const normalized = normalizeSaveGroceryShoppingDetailsInput(input);

  const { item, scope } = await loadGroceryItemScope(personId, itemId);
  const matchKey = groceryItemMatchKey(item);
  const requiredSnapshot = {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    food_object_id: item.food_object_id,
    source_planned_meal_ids: [...item.source_planned_meal_ids],
  };

  const payload: SaveShoppingOverrideInput = {
    match_key: matchKey,
    food_object_id: item.food_object_id,
    unresolved_name: item.food_object_id ? null : item.name,
    unresolved_unit: item.unit,
    shopping_display_name: normalized.shopping_display_name,
    purchase_quantity: normalized.purchase_quantity,
    purchase_unit: normalized.purchase_unit,
    preferred_product: normalized.preferred_product,
    aisle_category: normalized.aisle_category ?? item.aisle_category,
    note: normalized.note,
  };

  const saved = await saveShoppingOverride(personId, scope, payload);
  if (
    item.name !== requiredSnapshot.name ||
    item.quantity !== requiredSnapshot.quantity ||
    item.unit !== requiredSnapshot.unit ||
    item.food_object_id !== requiredSnapshot.food_object_id ||
    item.source_planned_meal_ids.join(',') !== requiredSnapshot.source_planned_meal_ids.join(',')
  ) {
    throw new Error('Saving shopping details must not mutate required grocery item truth.');
  }
  return saved;
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
