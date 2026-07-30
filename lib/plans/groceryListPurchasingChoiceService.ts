/**
 * List-scoped purchasing choices for durable Full Haul lists (PR3).
 *
 * Default writes only grocery_list_purchasing_choices.
 * Never mutates grocery_items.food_object_id / name / quantity / unit.
 * Person resolution and source-plan overrides are explicit opt-ins only.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  listGroceryIngredientResolutions,
  saveGroceryIngredientResolution,
  type GroceryIngredientResolution,
} from './groceryStateStore';
import type {
  GroceryItem,
  GroceryListPurchasingChoice,
  GroceryListPurchasingChoiceStatus,
  GroceryShoppingOverride,
} from './types';
import {
  groundedGroceryMatchKey,
} from './groceryMatchKeys';
import { formatCanonicalFoodShoppingLabel } from './groceryShoppingDisplay';
import { itemProvenanceScope } from './persistentGroceryHaulScopes';
import {
  deletePurchasingChoice,
  getPurchasingChoiceForItem,
  listPurchasingChoicesForList,
  patchPurchasingChoiceOptInReceipts,
  upsertPurchasingChoice,
} from './groceryListPurchasingChoiceStore';
import { saveShoppingOverride } from './groceryShoppingOverrideStore';

export {
  activePurchasingMatchKeyForItem,
  resolveListShoppingDisplayName,
} from './groceryListPurchasingChoiceDisplay';

export class GroceryListPurchasingChoiceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListPurchasingChoiceValidationError';
  }
}

function displayUnit(u: string | null | undefined): string | null {
  if (u == null) return null;
  const trimmed = String(u).trim();
  return trimmed ? trimmed : null;
}

function resolutionKey(name: string, unit: string | null): string {
  return `${name.toLowerCase().trim()}::${(unit ?? '').toLowerCase().trim()}`;
}

async function loadOwnedDurableListItem(
  personId: string,
  listId: string,
  itemId: string,
): Promise<{ list: { id: string; person_id: string; plan_id: string | null }; item: GroceryItem }> {
  const { data: list, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('id, person_id, plan_id')
    .eq('id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (listErr || !list) {
    throw new GroceryListPurchasingChoiceValidationError('Grocery list not found.');
  }
  if (list.plan_id) {
    throw new GroceryListPurchasingChoiceValidationError(
      'Use plan grocery resolution for plan-scoped lists.',
    );
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (itemErr || !item) {
    throw new GroceryListPurchasingChoiceValidationError('Grocery item not found on this list.');
  }

  return {
    list: list as { id: string; person_id: string; plan_id: string | null },
    item: item as unknown as GroceryItem,
  };
}

async function assertCallerOwnsSourcePlan(
  personId: string,
  planId: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('plans')
    .select('id, person_id')
    .eq('id', planId)
    .maybeSingle();
  if (error || !data) {
    throw new GroceryListPurchasingChoiceValidationError('Source plan not found.');
  }
  if (data.person_id !== personId) {
    throw new GroceryListPurchasingChoiceValidationError(
      'Cannot save to a source plan you do not own.',
    );
  }
}

export type ResolveForListOptions = {
  personId: string;
  listId: string;
  itemId: string;
  foodObjectId: string;
  /** Explicit opt-in: write person-level ingredient resolution. */
  rememberForFuture?: boolean;
  /** Explicit opt-in: write plan+date shopping override when caller owns source plan. */
  saveToSourcePlan?: boolean;
  /** Mark as purchased substitution rather than list_owner_resolved. */
  asPurchasedSubstitution?: boolean;
  preferredProduct?: string | null;
  note?: string | null;
};

export type ResolveForListResult = {
  item: GroceryItem;
  choice: GroceryListPurchasingChoice;
  /** Unchanged — derivation truth preserved. */
  item_food_object_id: string | null;
  shopping_override: GroceryShoppingOverride | null;
  person_resolution_saved: boolean;
};

/**
 * Use for this list — writes list purchasing choice only by default.
 * Does not mutate grocery_items.food_object_id.
 */
export async function resolveGroceryItemForList(
  options: ResolveForListOptions,
): Promise<ResolveForListResult> {
  const { personId, listId, itemId, foodObjectId } = options;
  const { item } = await loadOwnedDurableListItem(personId, listId, itemId);

  const requiredName = String(item.name ?? '');
  const requiredFoodObjectId = item.food_object_id;
  const requiredQuantity = item.quantity;
  const requiredUnit = item.unit;
  const unit = displayUnit(item.unit);

  const { data: food, error: foodErr } = await supabaseAdmin
    .from('food_objects')
    .select('id, canonical_name, brand_name')
    .eq('id', foodObjectId)
    .single();
  if (foodErr || !food) {
    throw new GroceryListPurchasingChoiceValidationError(
      `Canonical food not found: ${foodErr?.message ?? 'missing'}`,
    );
  }

  const productLabel = formatCanonicalFoodShoppingLabel({
    canonical_name: String(food.canonical_name ?? ''),
    brand_name: (food.brand_name as string | null | undefined) ?? null,
  });
  const matchKey = groundedGroceryMatchKey(food.id, unit);
  const provenance = itemProvenanceScope(item);
  const status: GroceryListPurchasingChoiceStatus = options.asPurchasedSubstitution
    ? 'purchased_substitution'
    : 'list_owner_resolved';

  let choice = await upsertPurchasingChoice({
    grocery_list_id: listId,
    grocery_item_id: itemId,
    person_id: personId,
    match_key: matchKey,
    status,
    food_object_id: food.id,
    shopping_display_name: productLabel,
    preferred_product: options.preferredProduct ?? null,
    aisle_category: item.aisle_category ?? null,
    note: options.note ?? null,
    required_name_snapshot: requiredName,
    required_unit_snapshot: unit,
    source_plan_id: provenance?.planId ?? null,
    source_date_range_start: provenance?.dateStart ?? null,
    source_date_range_end: provenance?.dateEnd ?? null,
  });

  let shopping_override: GroceryShoppingOverride | null = null;
  let person_resolution_saved = false;

  if (options.rememberForFuture) {
    const cleanedName = requiredName.trim();
    if (!cleanedName) {
      throw new GroceryListPurchasingChoiceValidationError(
        'Cannot remember resolution without a required name.',
      );
    }
    const key = resolutionKey(cleanedName, unit);
    const existing = await listGroceryIngredientResolutions(personId);
    const now = new Date().toISOString();
    const nextResolution: GroceryIngredientResolution = {
      key,
      raw_name: cleanedName,
      unit,
      food_object_id: food.id,
      canonical_name: String(food.canonical_name ?? ''),
      created_at: existing.find((r) => r.key === key)?.created_at ?? now,
      updated_at: now,
    };
    await saveGroceryIngredientResolution(personId, nextResolution);
    person_resolution_saved = true;
    choice = await patchPurchasingChoiceOptInReceipts(personId, choice.id, {
      applied_to_person_resolution_at: now,
    });
  }

  if (options.saveToSourcePlan) {
    if (!provenance) {
      throw new GroceryListPurchasingChoiceValidationError(
        'This item has no plan provenance to save into.',
      );
    }
    await assertCallerOwnsSourcePlan(personId, provenance.planId);
    shopping_override = await saveShoppingOverride(personId, provenance, {
      match_key: matchKey,
      food_object_id: food.id,
      unresolved_name: null,
      unresolved_unit: unit,
      shopping_display_name: productLabel,
      purchase_quantity: null,
      purchase_unit: null,
      preferred_product: options.preferredProduct ?? null,
      aisle_category: item.aisle_category ?? null,
      note: options.note ?? null,
    });
    choice = await patchPurchasingChoiceOptInReceipts(personId, choice.id, {
      applied_to_plan_override_id: shopping_override.id,
    });
  }

  // Guard: required row truth must remain unchanged after all writes.
  const { data: afterRow, error: afterErr } = await supabaseAdmin
    .from('grocery_items')
    .select('name, quantity, unit, food_object_id')
    .eq('id', itemId)
    .eq('person_id', personId)
    .single();
  if (afterErr || !afterRow) {
    throw new Error(`Failed to verify grocery item after list resolve: ${afterErr?.message ?? 'missing'}`);
  }
  if (
    afterRow.name !== requiredName ||
    afterRow.food_object_id !== requiredFoodObjectId ||
    String(afterRow.quantity ?? '') !== String(requiredQuantity ?? '') ||
    afterRow.unit !== requiredUnit
  ) {
    throw new Error('List resolve must not mutate required grocery item truth.');
  }

  return {
    item,
    choice,
    item_food_object_id: item.food_object_id,
    shopping_override,
    person_resolution_saved,
  };
}

export async function clearGroceryItemListChoice(options: {
  personId: string;
  listId: string;
  itemId: string;
}): Promise<{ item: GroceryItem }> {
  const { item } = await loadOwnedDurableListItem(
    options.personId,
    options.listId,
    options.itemId,
  );
  await deletePurchasingChoice(options.personId, options.listId, options.itemId);
  return { item };
}

export async function getListPurchasingChoicesBundle(
  personId: string,
  listId: string,
): Promise<Record<string, GroceryListPurchasingChoice>> {
  const rows = await listPurchasingChoicesForList(personId, listId);
  return Object.fromEntries(rows.map((row) => [row.grocery_item_id, row]));
}

export async function getPurchasingChoiceOrNull(
  personId: string,
  listId: string,
  itemId: string,
): Promise<GroceryListPurchasingChoice | null> {
  return getPurchasingChoiceForItem(personId, listId, itemId);
}
