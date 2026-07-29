/**
 * Persistent Grocery Lists v1 — default + named list service.
 *
 * Complements groceryServerService.ts (plan-derived generation, pricing,
 * resolution, pantry-deduction — all untouched by this file) with CRUD for
 * the persistent list model: a single running "My Grocery List" default per
 * person plus any number of user-named lists, none of which are tied to a
 * plan (`plan_id IS NULL`).
 *
 * IMPORTANT: this file assumes the columns added by
 * scripts/sql/addGroceryListFoundation.sql (is_default, owner_id,
 * created_by_person_id, archived_at, added_by_person_id, source_type,
 * source_id, source_detail_json) exist. That migration has NOT been applied
 * to any Supabase environment yet — this is review-first code. Every
 * function here will fail at runtime against the current live schema until
 * the migration is applied and approved separately.
 *
 * Server-only — never import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { GeneratedGroceryList, GroceryItem } from './types';

const DEFAULT_LIST_TITLE = 'My Grocery List';
const MAX_LIST_TITLE_LENGTH = 120;
const MAX_ITEM_NAME_LENGTH = 200;

/** Bad input from the caller. Maps to HTTP 400. */
export class GroceryListValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListValidationError';
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, GroceryListValidationError.prototype);
  }
}

/** Action refused due to current list/item state (e.g. delete non-empty list). Maps to HTTP 409. */
export class GroceryListConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListConflictError';
    Object.setPrototypeOf(this, GroceryListConflictError.prototype);
  }
}

/** No such list/item owned by the caller. Maps to HTTP 404. */
export class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListNotFoundError';
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}

function normalizeTitle(raw: unknown, fieldLabel = 'title'): string {
  if (typeof raw !== 'string') {
    throw new GroceryListValidationError(`${fieldLabel} is required.`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new GroceryListValidationError(`${fieldLabel} cannot be empty.`);
  }
  if (trimmed.length > MAX_LIST_TITLE_LENGTH) {
    throw new GroceryListValidationError(
      `${fieldLabel} must be ${MAX_LIST_TITLE_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

async function loadOwnedPersistentList(
  personId: string,
  listId: string,
): Promise<GeneratedGroceryList> {
  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('id', listId)
    .eq('owner_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery list: ${error.message}`);
  if (!data) throw new GroceryListNotFoundError('Grocery list not found.');
  return data as unknown as GeneratedGroceryList;
}

/**
 * Ensure the caller's single persistent default list ("My Grocery List")
 * exists and return it. Safe to call on every page load — idempotent, and
 * race-safe against concurrent calls via the partial unique index
 * (idx_grocery_lists_owner_default): a duplicate-insert race resolves by
 * re-fetching and returning the winner rather than erroring.
 */
export async function ensureDefaultGroceryList(personId: string): Promise<GeneratedGroceryList> {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('owner_id', personId)
    .eq('is_default', true)
    .is('archived_at', null)
    .maybeSingle();
  if (findErr) throw new Error(`Failed to look up default grocery list: ${findErr.message}`);
  if (existing) return existing as unknown as GeneratedGroceryList;

  const { data: created, error: insertErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .insert({
      plan_id: null,
      person_id: personId,
      owner_id: personId,
      created_by_person_id: personId,
      title: DEFAULT_LIST_TITLE,
      mode: 'manual',
      status: 'active',
      is_default: true,
    })
    .select('*')
    .single();

  if (!insertErr && created) return created as unknown as GeneratedGroceryList;

  // 23505 = unique_violation. A concurrent request won the race against
  // idx_grocery_lists_owner_default; the winner's row is the correct answer.
  if (insertErr?.code === '23505') {
    const { data: winner, error: refetchErr } = await supabaseAdmin
      .from('generated_grocery_lists')
      .select('*')
      .eq('owner_id', personId)
      .eq('is_default', true)
      .is('archived_at', null)
      .maybeSingle();
    if (refetchErr || !winner) {
      throw new Error(`Failed to resolve default grocery list race: ${refetchErr?.message ?? 'not found'}`);
    }
    return winner as unknown as GeneratedGroceryList;
  }

  throw new Error(`Failed to create default grocery list: ${insertErr?.message ?? 'no data'}`);
}

export async function createNamedGroceryList(
  personId: string,
  titleInput: unknown,
): Promise<GeneratedGroceryList> {
  const title = normalizeTitle(titleInput);

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .insert({
      plan_id: null,
      person_id: personId,
      owner_id: personId,
      created_by_person_id: personId,
      title,
      mode: 'manual',
      status: 'active',
      is_default: false,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create grocery list: ${error?.message ?? 'no data'}`);
  }
  return data as unknown as GeneratedGroceryList;
}

/**
 * Overview for the Food → Groceries index: the default list (auto-created
 * if missing), active named lists, and recent plan-derived lists. Read-only
 * — the only write side effect is ensureDefaultGroceryList's lazy create.
 */
export async function getGroceryListsOverview(personId: string): Promise<{
  default_list: GeneratedGroceryList;
  named_lists: GeneratedGroceryList[];
  plan_lists: GeneratedGroceryList[];
}> {
  const default_list = await ensureDefaultGroceryList(personId);

  const { data: namedRows, error: namedErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('owner_id', personId)
    .is('plan_id', null)
    .eq('is_default', false)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  if (namedErr) throw new Error(`Failed to list named grocery lists: ${namedErr.message}`);

  const { data: planRows, error: planErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('person_id', personId)
    .not('plan_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (planErr) throw new Error(`Failed to list plan-derived grocery lists: ${planErr.message}`);

  return {
    default_list,
    named_lists: (namedRows ?? []) as unknown as GeneratedGroceryList[],
    plan_lists: (planRows ?? []) as unknown as GeneratedGroceryList[],
  };
}

export async function getPersistentGroceryListDetail(
  personId: string,
  listId: string,
): Promise<{ list: GeneratedGroceryList; items: GroceryItem[] }> {
  const list = await loadOwnedPersistentList(personId, listId);

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('grocery_list_id', list.id)
    .eq('person_id', personId)
    .order('created_at', { ascending: true });
  if (itemsErr) throw new Error(`Failed to load grocery items: ${itemsErr.message}`);

  return { list, items: (items ?? []) as unknown as GroceryItem[] };
}

export async function renameGroceryList(
  personId: string,
  listId: string,
  titleInput: unknown,
): Promise<GeneratedGroceryList> {
  const list = await loadOwnedPersistentList(personId, listId);
  if (list.is_default) {
    throw new GroceryListValidationError('The default "My Grocery List" cannot be renamed.');
  }
  if (list.plan_id) {
    throw new GroceryListValidationError('Plan-derived grocery lists cannot be renamed here.');
  }
  const title = normalizeTitle(titleInput);

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .update({ title })
    .eq('id', listId)
    .eq('owner_id', personId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to rename grocery list: ${error?.message ?? 'not found'}`);
  }
  return data as unknown as GeneratedGroceryList;
}

export async function archiveGroceryList(
  personId: string,
  listId: string,
): Promise<GeneratedGroceryList> {
  const list = await loadOwnedPersistentList(personId, listId);
  if (list.is_default) {
    throw new GroceryListValidationError('The default "My Grocery List" cannot be archived.');
  }
  if (list.plan_id) {
    throw new GroceryListValidationError('Plan-derived grocery lists cannot be archived here.');
  }

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', listId)
    .eq('owner_id', personId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to archive grocery list: ${error?.message ?? 'not found'}`);
  }
  return data as unknown as GeneratedGroceryList;
}

export async function unarchiveGroceryList(
  personId: string,
  listId: string,
): Promise<GeneratedGroceryList> {
  const list = await loadOwnedPersistentList(personId, listId);
  if (!list.archived_at) return list;

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .update({ status: 'active', archived_at: null })
    .eq('id', listId)
    .eq('owner_id', personId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to unarchive grocery list: ${error?.message ?? 'not found'}`);
  }
  return data as unknown as GeneratedGroceryList;
}

/**
 * Delete is intentionally narrow: only a non-default, planless, empty list
 * may be deleted. Anything with items should be archived instead so shopping
 * history / provenance is never silently lost.
 */
export async function deleteGroceryList(personId: string, listId: string): Promise<void> {
  const list = await loadOwnedPersistentList(personId, listId);
  if (list.is_default) {
    throw new GroceryListValidationError('The default "My Grocery List" cannot be deleted.');
  }
  if (list.plan_id) {
    throw new GroceryListValidationError('Plan-derived grocery lists cannot be deleted here.');
  }

  const { count, error: countErr } = await supabaseAdmin
    .from('grocery_items')
    .select('id', { count: 'exact', head: true })
    .eq('grocery_list_id', listId)
    .eq('person_id', personId);
  if (countErr) throw new Error(`Failed to check grocery list contents: ${countErr.message}`);
  if ((count ?? 0) > 0) {
    throw new GroceryListConflictError(
      'This list still has items. Archive it instead, or remove all items first.',
    );
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .delete()
    .eq('id', listId)
    .eq('owner_id', personId);
  if (deleteErr) throw new Error(`Failed to delete grocery list: ${deleteErr.message}`);
}

// ============================================================================
// Items — persistent (planless) lists only. Plan-derived list items continue
// to flow exclusively through groceryServerService.ts's generation +
// resolution pipeline.
// ============================================================================

export async function addGroceryListItem(
  personId: string,
  listId: string,
  input: { name?: unknown; quantity?: unknown; unit?: unknown; notes?: unknown },
): Promise<GroceryItem> {
  const list = await loadOwnedPersistentList(personId, listId);
  if (list.plan_id) {
    throw new GroceryListValidationError('Items on plan-derived lists are managed from the plan.');
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new GroceryListValidationError('name is required.');
  if (name.length > MAX_ITEM_NAME_LENGTH) {
    throw new GroceryListValidationError(`name must be ${MAX_ITEM_NAME_LENGTH} characters or fewer.`);
  }

  let quantity: number | null = null;
  if (input.quantity != null) {
    if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity < 0) {
      throw new GroceryListValidationError('quantity must be a non-negative number when provided.');
    }
    quantity = input.quantity;
  }

  const unit = typeof input.unit === 'string' && input.unit.trim() ? input.unit.trim() : null;
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null;

  const { data, error } = await supabaseAdmin
    .from('grocery_items')
    .insert({
      grocery_list_id: listId,
      person_id: personId,
      added_by_person_id: personId,
      source_type: 'manual',
      name,
      quantity,
      unit,
      notes,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to add grocery item: ${error?.message ?? 'no data'}`);
  }
  return data as unknown as GroceryItem;
}

async function loadOwnedPersistentItem(
  personId: string,
  listId: string,
  itemId: string,
): Promise<GroceryItem> {
  const list = await loadOwnedPersistentList(personId, listId);
  if (list.plan_id) {
    throw new GroceryListValidationError('Items on plan-derived lists are managed from the plan.');
  }
  const { data, error } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery item: ${error.message}`);
  if (!data) throw new GroceryListNotFoundError('Grocery item not found.');
  return data as unknown as GroceryItem;
}

export async function updateGroceryListItem(
  personId: string,
  listId: string,
  itemId: string,
  patch: {
    name?: unknown;
    quantity?: unknown;
    unit?: unknown;
    notes?: unknown;
    status?: unknown;
  },
): Promise<GroceryItem> {
  await loadOwnedPersistentItem(personId, listId, itemId);

  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = typeof patch.name === 'string' ? patch.name.trim() : '';
    if (!name) throw new GroceryListValidationError('name cannot be empty.');
    if (name.length > MAX_ITEM_NAME_LENGTH) {
      throw new GroceryListValidationError(`name must be ${MAX_ITEM_NAME_LENGTH} characters or fewer.`);
    }
    update.name = name;
  }

  if (patch.quantity !== undefined) {
    if (patch.quantity === null) {
      update.quantity = null;
    } else if (
      typeof patch.quantity !== 'number' ||
      !Number.isFinite(patch.quantity) ||
      patch.quantity < 0
    ) {
      throw new GroceryListValidationError('quantity must be a non-negative number.');
    } else {
      update.quantity = patch.quantity;
    }
  }

  if (patch.unit !== undefined) {
    update.unit = typeof patch.unit === 'string' && patch.unit.trim() ? patch.unit.trim() : null;
  }

  if (patch.notes !== undefined) {
    update.notes = typeof patch.notes === 'string' && patch.notes.trim() ? patch.notes.trim() : null;
  }

  if (patch.status !== undefined) {
    const ALLOWED = ['pending', 'have', 'bought', 'skipped'];
    if (typeof patch.status !== 'string' || !ALLOWED.includes(patch.status)) {
      throw new GroceryListValidationError(`status must be one of: ${ALLOWED.join(', ')}`);
    }
    update.status = patch.status;
  }

  if (Object.keys(update).length === 0) {
    throw new GroceryListValidationError('No changes supplied.');
  }

  const { data, error } = await supabaseAdmin
    .from('grocery_items')
    .update(update)
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to update grocery item: ${error?.message ?? 'not found'}`);
  }
  return data as unknown as GroceryItem;
}

export async function deleteGroceryListItem(
  personId: string,
  listId: string,
  itemId: string,
): Promise<void> {
  await loadOwnedPersistentItem(personId, listId, itemId);

  const { error } = await supabaseAdmin
    .from('grocery_items')
    .delete()
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId);
  if (error) throw new Error(`Failed to delete grocery item: ${error.message}`);
}
