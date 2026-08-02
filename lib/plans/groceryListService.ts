/**
 * Persistent Grocery Lists v1 — service layer for default/named lists,
 * manual item management, and additive target-list reconciliation of
 * plan-derived demand.
 *
 * Ownership boundary: `person_id` only. Per the review-first correction to
 * this packet, no `owner_type` / `owner_id` pair is introduced — every
 * function here scopes reads/writes to the caller-supplied `personId`,
 * matching the table's RLS policies exactly (see
 * scripts/sql/addGroceryListFoundation.sql).
 *
 * This module is additive alongside `groceryServerService.ts`, which keeps
 * owning the plan/date-scoped generation workflow (readiness, pricing,
 * ingredient resolution, and shopping overrides all continue to read/write
 * through it, completely unchanged). `reconcilePlanScopeIntoGroceryList`
 * below is the one bridge between the two: it reuses
 * `deriveGroceryDemandForScope`'s derivation pipeline — the same
 * meals-in-range → `deriveItemsFromMeals` logic `generateGroceryList` uses
 * internally — and then additively merges the result into a chosen
 * persistent list, rather than replacing the persistent list wholesale.
 * It deliberately does NOT call `generateGroceryList` itself: that function
 * can fall back to an existing *broader* list via `selectActiveGroceryList`
 * when no list exists for the exact requested scope, which would let
 * demand from outside the requested window get tagged under this
 * narrower batch's key. `deriveGroceryDemandForScope` has no such
 * fallback — it always derives fresh from exactly `[dateStart, dateEnd]`
 * and never reads/writes `generated_grocery_lists`/`grocery_items` for the
 * legacy plan-scoped list at all.
 *
 * Server-only — never import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GeneratedGroceryList,
  GroceryItem,
  GroceryItemStatus,
  PantryOnHandItem,
  PlannedMeal,
} from './types';
import { deriveGroceryDemandForScope, listGroceryListsForPerson } from './groceryServerService';
import { groceryItemMatchKey } from './groceryMatchKeys';
import type { GroceryDemandEmptyReason } from './pullFromPlanSelection';

// ============================================================================
// Errors
// ============================================================================

export class GroceryListValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListValidationError';
    Object.setPrototypeOf(this, GroceryListValidationError.prototype);
  }
}

export class GroceryListConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListConflictError';
    Object.setPrototypeOf(this, GroceryListConflictError.prototype);
  }
}

export class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListNotFoundError';
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}

const DEFAULT_LIST_TITLE = 'My Grocery List';
const MAX_TITLE_LENGTH = 120;
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === UNIQUE_VIOLATION || /duplicate key/i.test(error.message ?? '');
}

function assertPersonId(personId: unknown): asserts personId is string {
  if (typeof personId !== 'string' || !personId) {
    throw new GroceryListValidationError('personId is required.');
  }
}

function normalizeTitle(title: unknown): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed) throw new GroceryListValidationError('title is required.');
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new GroceryListValidationError(`title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

// ============================================================================
// List lookups
// ============================================================================

async function loadListOwnedByPerson(
  personId: string,
  listId: string,
): Promise<GeneratedGroceryList> {
  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery list: ${error.message}`);
  if (!data) throw new GroceryListNotFoundError('Grocery list not found.');
  return data as unknown as GeneratedGroceryList;
}

/**
 * Idempotently create-or-fetch the person's single running default list,
 * shown to users as "My Grocery List". Race-safe: relies on the partial
 * unique index on (person_id) WHERE is_default AND archived_at IS NULL to
 * detect a concurrent create and re-fetch rather than error.
 */
export async function ensureDefaultGroceryList(personId: string): Promise<GeneratedGroceryList> {
  assertPersonId(personId);

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('person_id', personId)
    .eq('is_default', true)
    .is('archived_at', null)
    .maybeSingle();
  if (existingErr) throw new Error(`Failed to load default grocery list: ${existingErr.message}`);
  if (existing) return existing as unknown as GeneratedGroceryList;

  const { data: created, error: createErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .insert({
      person_id: personId,
      created_by_person_id: personId,
      title: DEFAULT_LIST_TITLE,
      plan_id: null,
      date_range_start: null,
      date_range_end: null,
      mode: 'manual',
      status: 'active',
      is_default: true,
    })
    .select('*')
    .single();

  if (createErr) {
    if (isUniqueViolation(createErr)) {
      const { data: retry, error: retryErr } = await supabaseAdmin
        .from('generated_grocery_lists')
        .select('*')
        .eq('person_id', personId)
        .eq('is_default', true)
        .is('archived_at', null)
        .maybeSingle();
      if (retryErr || !retry) {
        throw new Error(
          `Failed to load default grocery list after conflict: ${retryErr?.message ?? 'not found'}`,
        );
      }
      return retry as unknown as GeneratedGroceryList;
    }
    throw new Error(`Failed to create default grocery list: ${createErr.message}`);
  }
  if (!created) throw new Error('Failed to create default grocery list: no data returned.');
  return created as unknown as GeneratedGroceryList;
}

export async function createNamedGroceryList(
  personId: string,
  title: string,
): Promise<GeneratedGroceryList> {
  assertPersonId(personId);
  const trimmed = normalizeTitle(title);

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .insert({
      person_id: personId,
      created_by_person_id: personId,
      title: trimmed,
      plan_id: null,
      date_range_start: null,
      date_range_end: null,
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

export interface GroceryListsOverview {
  default_list: GeneratedGroceryList;
  named_lists: GeneratedGroceryList[];
  archived_lists: GeneratedGroceryList[];
  /** Read-only, plan/date-scoped lists from the existing generation workflow. */
  plan_lists: GeneratedGroceryList[];
}

export async function getGroceryListsOverview(personId: string): Promise<GroceryListsOverview> {
  assertPersonId(personId);
  const default_list = await ensureDefaultGroceryList(personId);

  const { data: rows, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('*')
    .eq('person_id', personId)
    .is('plan_id', null)
    .neq('id', default_list.id)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list grocery lists: ${error.message}`);

  const all = (rows ?? []) as unknown as GeneratedGroceryList[];
  const named_lists = all.filter((list) => !list.archived_at);
  const archived_lists = all.filter((list) => Boolean(list.archived_at));
  const plan_lists = await listGroceryListsForPerson(personId, 10);

  return { default_list, named_lists, archived_lists, plan_lists };
}

export async function getPersistentGroceryListDetail(
  personId: string,
  listId: string,
): Promise<{ list: GeneratedGroceryList; items: GroceryItem[] }> {
  assertPersonId(personId);
  const list = await loadListOwnedByPerson(personId, listId);

  const { data: items, error } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load grocery items: ${error.message}`);

  return { list, items: (items ?? []) as unknown as GroceryItem[] };
}

export async function renameGroceryList(
  personId: string,
  listId: string,
  title: string,
): Promise<GeneratedGroceryList> {
  assertPersonId(personId);
  const trimmed = normalizeTitle(title);
  await loadListOwnedByPerson(personId, listId);

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .update({ title: trimmed })
    .eq('id', listId)
    .eq('person_id', personId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to rename grocery list: ${error?.message ?? 'not found'}`);
  return data as unknown as GeneratedGroceryList;
}

export async function archiveGroceryList(
  personId: string,
  listId: string,
): Promise<GeneratedGroceryList> {
  assertPersonId(personId);
  const list = await loadListOwnedByPerson(personId, listId);
  if (list.is_default) {
    throw new GroceryListValidationError('The default My Grocery List cannot be archived.');
  }

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .update({ archived_at: new Date().toISOString(), status: 'archived' })
    .eq('id', listId)
    .eq('person_id', personId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to archive grocery list: ${error?.message ?? 'not found'}`);
  return data as unknown as GeneratedGroceryList;
}

export async function unarchiveGroceryList(
  personId: string,
  listId: string,
): Promise<GeneratedGroceryList> {
  assertPersonId(personId);
  await loadListOwnedByPerson(personId, listId);

  const { data, error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .update({ archived_at: null, status: 'active' })
    .eq('id', listId)
    .eq('person_id', personId)
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      throw new GroceryListConflictError(
        'You already have an active default list, so this list cannot be marked default. Restore it as a named list instead.',
      );
    }
    throw new Error(`Failed to unarchive grocery list: ${error.message}`);
  }
  if (!data) throw new GroceryListNotFoundError('Grocery list not found.');
  return data as unknown as GeneratedGroceryList;
}

export async function deleteGroceryList(personId: string, listId: string): Promise<void> {
  assertPersonId(personId);
  const list = await loadListOwnedByPerson(personId, listId);
  if (list.is_default) {
    throw new GroceryListValidationError('The default My Grocery List cannot be deleted.');
  }
  if (list.plan_id) {
    throw new GroceryListValidationError('Plan-derived lists cannot be deleted here.');
  }

  const { count, error: countErr } = await supabaseAdmin
    .from('grocery_items')
    .select('id', { count: 'exact', head: true })
    .eq('grocery_list_id', listId)
    .eq('person_id', personId);
  if (countErr) throw new Error(`Failed to check grocery list items: ${countErr.message}`);
  if ((count ?? 0) > 0) {
    throw new GroceryListValidationError(
      'Only empty lists can be deleted. Archive lists with items instead.',
    );
  }

  const { error } = await supabaseAdmin
    .from('generated_grocery_lists')
    .delete()
    .eq('id', listId)
    .eq('person_id', personId);
  if (error) throw new Error(`Failed to delete grocery list: ${error.message}`);
}

// ============================================================================
// Manual item CRUD
// ============================================================================

export interface AddGroceryListItemInput {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  notes?: unknown;
  food_object_id?: unknown;
  /** Exact typed entry preserved on create (search-first Add Item). */
  raw_entry?: unknown;
  /**
   * When true with food_object_id, also create an initial list purchasing
   * choice (product pick). Ingredient grounding sets food_object_id only.
   */
  create_purchasing_choice?: unknown;
}

function normalizeQuantity(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new GroceryListValidationError('quantity must be a non-negative number.');
  }
  return num;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function addGroceryListItem(
  personId: string,
  listId: string,
  input: AddGroceryListItemInput,
): Promise<GroceryItem> {
  assertPersonId(personId);
  const list = await loadListOwnedByPerson(personId, listId);
  if (list.plan_id) {
    throw new GroceryListValidationError('Items on plan-derived lists are managed from the Plan grocery page.');
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new GroceryListValidationError('name is required.');

  const rawEntry = normalizeOptionalString(input.raw_entry);
  const sourceDetail: Record<string, unknown> = {};
  if (rawEntry) sourceDetail.raw_entry = rawEntry;

  const { data, error } = await supabaseAdmin
    .from('grocery_items')
    .insert({
      grocery_list_id: listId,
      person_id: personId,
      added_by_person_id: personId,
      name,
      quantity: normalizeQuantity(input.quantity),
      unit: normalizeOptionalString(input.unit),
      notes: normalizeOptionalString(input.notes),
      food_object_id: normalizeOptionalString(input.food_object_id),
      source_type: 'manual',
      source_planned_meal_ids: [],
      source_detail_json: sourceDetail,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to add grocery item: ${error?.message ?? 'no data'}`);
  return data as unknown as GroceryItem;
}

export interface UpdateGroceryListItemInput {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  notes?: unknown;
  status?: unknown;
}

const ALLOWED_ITEM_STATUSES: GroceryItemStatus[] = ['pending', 'have', 'bought', 'skipped'];

export async function updateGroceryListItem(
  personId: string,
  listId: string,
  itemId: string,
  input: UpdateGroceryListItemInput,
): Promise<GroceryItem> {
  assertPersonId(personId);
  await loadListOwnedByPerson(personId, listId);

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (existingErr) throw new Error(`Failed to load grocery item: ${existingErr.message}`);
  if (!existing) throw new GroceryListNotFoundError('Grocery item not found.');

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new GroceryListValidationError('name cannot be empty.');
    patch.name = name;
  }
  if (input.quantity !== undefined) patch.quantity = normalizeQuantity(input.quantity);
  if (input.unit !== undefined) patch.unit = normalizeOptionalString(input.unit);
  if (input.notes !== undefined) patch.notes = normalizeOptionalString(input.notes);
  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !ALLOWED_ITEM_STATUSES.includes(input.status as GroceryItemStatus)) {
      throw new GroceryListValidationError('Invalid status.');
    }
    patch.status = input.status;
  }

  if (Object.keys(patch).length === 0) return existing as unknown as GroceryItem;

  const { data, error } = await supabaseAdmin
    .from('grocery_items')
    .update(patch)
    .eq('id', itemId)
    .eq('person_id', personId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to update grocery item: ${error?.message ?? 'not found'}`);
  return data as unknown as GroceryItem;
}

export async function deleteGroceryListItem(
  personId: string,
  listId: string,
  itemId: string,
): Promise<void> {
  assertPersonId(personId);
  await loadListOwnedByPerson(personId, listId);

  const { data, error } = await supabaseAdmin
    .from('grocery_items')
    .delete()
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .select('id');
  if (error) throw new Error(`Failed to delete grocery item: ${error.message}`);
  if (!data || data.length === 0) throw new GroceryListNotFoundError('Grocery item not found.');
}

// ============================================================================
// Target-list generation — additive, idempotent reconciliation of
// plan-derived demand into a chosen persistent list.
// ============================================================================

function planScopeSourceDetail(dateStart: string, dateEnd: string): { date_range_start: string; date_range_end: string } {
  return { date_range_start: dateStart, date_range_end: dateEnd };
}

function matchesSourceDetail(
  item: Pick<GroceryItem, 'source_detail_json'>,
  sourceDetail: { date_range_start: string; date_range_end: string },
): boolean {
  const detail = (item.source_detail_json ?? {}) as Record<string, unknown>;
  return (
    detail.date_range_start === sourceDetail.date_range_start &&
    detail.date_range_end === sourceDetail.date_range_end
  );
}

export interface ReconcilePlanScopeOptions {
  personId: string;
  /** Persistent list to reconcile into. Defaults to the person's default list. */
  targetListId?: string | null;
  planId: string;
  dateStart: string;
  dateEnd: string;
  /**
   * @deprecated No longer used. `deriveGroceryDemandForScope` always derives
   * fresh from the exact requested date range — there is no persisted
   * intermediate list for this bridge to regenerate. Kept only so existing
   * callers passing `regenerate` don't break; accepted and ignored.
   */
  forceRegenerate?: boolean;
}

export type { GroceryDemandEmptyReason };

export interface ReconcilePlanScopeResult {
  target_list: GeneratedGroceryList;
  /** Full current item set for the target list, including untouched manual/other-batch rows. */
  items: GroceryItem[];
  /** IDs, within `items`, that this reconciliation batch currently owns. */
  batch_item_ids: string[];
  source_meals: PlannedMeal[];
  pantry_items: PantryOnHandItem[];
  source_day_count: number;
  source_meal_count: number;
  pending_meal_count: number;
  derived_item_count: number;
  /** Null when derived_item_count > 0 (and therefore when batch inserts/updates occurred from demand). */
  empty_reason: GroceryDemandEmptyReason | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mandatory target-list generation (Persistent Grocery Lists v1 corrected
 * packet, §5). Reuses `deriveGroceryDemandForScope`'s derivation —
 * pending-meals-only, unit normalization, pantry, and resolution-aware
 * grouping, always for the *exact* requested date range — then additively
 * reconciles the result into a chosen persistent list:
 *
 *   - Rows are scoped to this call's "batch" by
 *     (grocery_list_id, source_type='planned_meal', source_id=planId,
 *     source_detail_json = {date_range_start, date_range_end} exactly).
 *     Only rows in that exact batch are ever touched — manual items and
 *     other batches (different plans, different date ranges, or a
 *     different target list) are never read, updated, or deleted. The
 *     date-range check is exact-match, not "contains", specifically so a
 *     food/unit that repeats across two different windows on the same
 *     plan (e.g. the same staple item in week 1 and week 2) never lets one
 *     window's batch claim or delete the other's row.
 *   - A derived item whose match key (grounded: food_object_id+unit;
 *     unresolved: name+unit) already exists in the batch is UPDATED in
 *     place (name/quantity/unit/food_object_id/source_planned_meal_ids/
 *     notes refreshed), preserving its current `status` — so checked-off/
 *     bought/have/skipped survives regeneration.
 *   - A derived item with no existing batch row is INSERTED as `pending`.
 *   - A batch row with no matching derived item anymore (its contributing
 *     meal was removed or handled) is DELETED — and only that row.
 *   - Re-running with the same (targetListId, planId, dateStart, dateEnd)
 *     and no plan changes is therefore a no-op: same match keys in, same
 *     rows out, nothing inserted/updated/deleted beyond a status no-op.
 */
export async function reconcilePlanScopeIntoGroceryList(
  options: ReconcilePlanScopeOptions,
): Promise<ReconcilePlanScopeResult> {
  const { personId, planId, dateStart, dateEnd } = options;
  assertPersonId(personId);
  if (typeof planId !== 'string' || !planId) {
    throw new GroceryListValidationError('planId is required.');
  }
  if (!DATE_RE.test(dateStart) || !DATE_RE.test(dateEnd)) {
    throw new GroceryListValidationError('dateStart and dateEnd must be YYYY-MM-DD.');
  }
  if (dateEnd < dateStart) {
    throw new GroceryListValidationError('dateEnd must be on or after dateStart.');
  }

  const targetList = options.targetListId
    ? await loadListOwnedByPerson(personId, options.targetListId)
    : await ensureDefaultGroceryList(personId);
  if (targetList.plan_id) {
    throw new GroceryListValidationError(
      'Cannot reconcile into a plan-scoped list; choose a persistent list instead.',
    );
  }
  if (targetList.archived_at) {
    throw new GroceryListValidationError('Cannot reconcile into an archived list.');
  }

  const sourceResult = await deriveGroceryDemandForScope({ personId, planId, dateStart, dateEnd });

  const sourceDetail = planScopeSourceDetail(dateStart, dateEnd);
  const { data: existingBatchRows, error: existingErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('grocery_list_id', targetList.id)
    .eq('person_id', personId)
    .eq('source_type', 'planned_meal')
    .eq('source_id', planId)
    .contains('source_detail_json', sourceDetail);
  if (existingErr) throw new Error(`Failed to load existing grocery contributions: ${existingErr.message}`);
  const existingRows = (existingBatchRows ?? []) as unknown as GroceryItem[];
  const existingByMatchKey = new Map(existingRows.map((row) => [groceryItemMatchKey(row), row]));

  const derivedMatchKeys = new Set(sourceResult.items.map((item) => groceryItemMatchKey(item)));
  const staleIds = existingRows
    .filter((row) => !derivedMatchKeys.has(groceryItemMatchKey(row)))
    .map((row) => row.id);

  if (staleIds.length > 0) {
    const { error: deleteErr } = await supabaseAdmin
      .from('grocery_items')
      .delete()
      .in('id', staleIds)
      .eq('person_id', personId);
    if (deleteErr) throw new Error(`Failed to remove stale grocery contributions: ${deleteErr.message}`);
  }

  const rowsToInsert: Record<string, unknown>[] = [];
  for (const derived of sourceResult.items) {
    const key = groceryItemMatchKey(derived);
    const existing = existingByMatchKey.get(key);
    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('grocery_items')
        .update({
          name: derived.name,
          quantity: derived.quantity,
          unit: derived.unit,
          food_object_id: derived.food_object_id,
          source_planned_meal_ids: derived.source_planned_meal_ids,
          notes: derived.notes,
          source_detail_json: {
            ...sourceDetail,
            ...(derived.source_detail_json ?? {}),
          },
        })
        .eq('id', existing.id)
        .eq('person_id', personId);
      if (updateErr) throw new Error(`Failed to refresh grocery contribution: ${updateErr.message}`);
    } else {
      rowsToInsert.push({
        grocery_list_id: targetList.id,
        person_id: personId,
        added_by_person_id: personId,
        name: derived.name,
        quantity: derived.quantity,
        unit: derived.unit,
        food_object_id: derived.food_object_id,
        source_planned_meal_ids: derived.source_planned_meal_ids,
        notes: derived.notes,
        status: 'pending',
        source_type: 'planned_meal',
        source_id: planId,
        source_detail_json: {
          ...sourceDetail,
          ...(derived.source_detail_json ?? {}),
        },
      });
    }
  }

  if (rowsToInsert.length > 0) {
    const { error: insertErr } = await supabaseAdmin.from('grocery_items').insert(rowsToInsert);
    if (insertErr) throw new Error(`Failed to insert grocery contributions: ${insertErr.message}`);
  }

  if (staleIds.length > 0 || rowsToInsert.length > 0) {
    await supabaseAdmin
      .from('generated_grocery_lists')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', targetList.id)
      .eq('person_id', personId);
  }

  const { list: refreshedList, items } = await getPersistentGroceryListDetail(personId, targetList.id);
  const batch_item_ids = items
    .filter(
      (item) =>
        item.source_type === 'planned_meal' &&
        item.source_id === planId &&
        matchesSourceDetail(item, sourceDetail) &&
        derivedMatchKeys.has(groceryItemMatchKey(item)),
    )
    .map((item) => item.id);

  return {
    target_list: refreshedList,
    items,
    batch_item_ids,
    source_meals: sourceResult.source_meals,
    pantry_items: sourceResult.pantry_items,
    source_day_count: sourceResult.source_day_count,
    source_meal_count: sourceResult.source_meal_count,
    pending_meal_count: sourceResult.pending_meal_count,
    derived_item_count: sourceResult.derived_item_count,
    empty_reason: sourceResult.empty_reason,
  };
}
