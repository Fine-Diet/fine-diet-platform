/**
 * Packet 11B — Canonical Haul create/read service.
 *
 * Create calls the live Packet 11C RPC via supabaseAdmin (service_role only).
 * Grocery List and Pantry writers stay untouched. Item snapshots are never
 * accepted from the client.
 *
 * Server-only — never import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GroceryHaul,
  GroceryHaulAcquisitionPatch,
  GroceryHaulAddSourcesResult,
  GroceryHaulCollectionItem,
  GroceryHaulCreateResult,
  GroceryHaulDetail,
  GroceryHaulExecutionDetail,
  GroceryHaulExecutionFinding,
  GroceryHaulExecutionItem,
  GroceryHaulExecutionItemState,
  GroceryHaulExecutionReadiness,
  GroceryHaulExecutionStartResult,
  GroceryHaulItem,
  GroceryHaulStatus,
  GroceryItem,
} from '@/lib/plans/types';
import {
  GroceryListNotFoundError,
  getPersistentGroceryListDetail,
} from '@/lib/plans/groceryListService';
import { evaluateGroceryListReadiness } from '@/lib/plans/groceryListReadiness/policy';
import { resolveGroceryHaulCreateEligibility } from './eligibility';
import {
  GROCERY_HAUL_ADD_LISTS_RPC_NAME,
  GROCERY_HAUL_CREATE_MULTI_RPC_NAME,
  GROCERY_HAUL_CREATE_RPC_NAME,
  GROCERY_HAUL_EXECUTION_READINESS_RPC_NAME,
  GROCERY_HAUL_EXECUTION_START_RPC_NAME,
  GROCERY_HAUL_OPEN_STATUSES,
  isGroceryHaulCreationToken,
  isGroceryHaulCurrency,
  isGroceryHaulShoppingDate,
  isGroceryHaulStatus,
} from './schema';
import { computeGroceryHaulPreparationEstimate } from './estimate';

export class GroceryHaulValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryHaulValidationError';
    Object.setPrototypeOf(this, GroceryHaulValidationError.prototype);
  }
}

export class GroceryHaulNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryHaulNotFoundError';
    Object.setPrototypeOf(this, GroceryHaulNotFoundError.prototype);
  }
}

export class GroceryHaulConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryHaulConflictError';
    Object.setPrototypeOf(this, GroceryHaulConflictError.prototype);
  }
}

export class GroceryHaulForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryHaulForbiddenError';
    Object.setPrototypeOf(this, GroceryHaulForbiddenError.prototype);
  }
}

export class GroceryHaulBlockedError extends Error {
  readonly blockReason: string;

  constructor(blockReason: string, message: string) {
    super(message);
    this.name = 'GroceryHaulBlockedError';
    this.blockReason = blockReason;
    Object.setPrototypeOf(this, GroceryHaulBlockedError.prototype);
  }
}

const BLOCK_COPY: Record<string, string> = {
  archived: 'Restore this list before starting a shopping trip.',
  empty_or_no_demand: 'Nothing to shop yet on this list.',
  needs_resolution: 'Resolve remaining list items before starting a shopping trip.',
  complete_or_closed: 'Nothing left to buy on this list.',
  no_pending: 'Nothing pending to shop right now.',
  token_mismatch: 'This shopping start does not match the original date. Refresh and try again.',
};

function rpcMessage(error: { message?: string } | null): string {
  return error?.message ?? '';
}

function parseCreateResult(data: unknown): GroceryHaulCreateResult {
  const record =
    typeof data === 'string'
      ? (JSON.parse(data) as Record<string, unknown>)
      : (data as Record<string, unknown> | null);
  if (!record || typeof record !== 'object') {
    throw new Error('Grocery haul create returned no result.');
  }
  const haulId = typeof record.haul_id === 'string' ? record.haul_id : '';
  const personId = typeof record.person_id === 'string' ? record.person_id : '';
  const sourceListId =
    typeof record.source_grocery_list_id === 'string' ? record.source_grocery_list_id : '';
  const sourceListIds = Array.isArray(record.source_grocery_list_ids)
    ? Array.from(
        new Set(
          record.source_grocery_list_ids.filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      )
    : sourceListId
      ? [sourceListId]
      : [];
  const shoppingDate = typeof record.shopping_date === 'string' ? record.shopping_date : '';
  const status = typeof record.status === 'string' && isGroceryHaulStatus(record.status)
    ? record.status
    : null;
  const creationToken = typeof record.creation_token === 'string' ? record.creation_token : '';
  const itemCount = typeof record.item_count === 'number' ? record.item_count : Number(record.item_count);
  const outcome = record.outcome === 'created' || record.outcome === 'reused' ? record.outcome : null;
  if (
    !haulId
    || !personId
    || !sourceListId
    || sourceListIds.length === 0
    || !sourceListIds.includes(sourceListId)
    || !shoppingDate
    || !status
    || !creationToken
    || !outcome
  ) {
    throw new Error('Grocery haul create returned an incomplete result.');
  }
  if (!Number.isFinite(itemCount) || itemCount < 0) {
    throw new Error('Grocery haul create returned an incomplete result.');
  }
  return {
    haul_id: haulId,
    person_id: personId,
    source_grocery_list_id: sourceListId,
    source_grocery_list_ids: sourceListIds,
    shopping_date: shoppingDate,
    status,
    creation_token: creationToken,
    item_count: Math.floor(itemCount),
    outcome,
  };
}

function finiteNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapHaul(row: Record<string, unknown>): GroceryHaul {
  const status = String(row.status ?? '');
  if (!isGroceryHaulStatus(status)) {
    throw new Error(`Grocery haul ${String(row.id)} has unrecognised status "${status}".`);
  }
  return {
    id: String(row.id),
    person_id: String(row.person_id),
    source_grocery_list_id: String(row.source_grocery_list_id),
    shopping_date: String(row.shopping_date),
    status,
    creation_token: String(row.creation_token),
    title: typeof row.title === 'string' ? row.title : null,
    budget_amount: finiteNumber(row.budget_amount),
    currency: typeof row.currency === 'string' ? row.currency : 'USD',
    shopping_started_at:
      typeof row.shopping_started_at === 'string' ? row.shopping_started_at : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapHaulItem(row: Record<string, unknown>): GroceryHaulItem {
  return {
    ...(row as unknown as GroceryHaulItem),
    quantity_snapshot: finiteNumber(row.quantity_snapshot),
    final_quantity:
      finiteNumber(row.final_quantity)
      ?? finiteNumber(row.quantity_snapshot)
      ?? 1,
    package_size: finiteNumber(row.package_size),
    package_count: finiteNumber(row.package_count),
    price_amount: finiteNumber(row.price_amount),
  };
}

function parseAddSourcesResult(data: unknown): GroceryHaulAddSourcesResult {
  const record =
    typeof data === 'string'
      ? (JSON.parse(data) as Record<string, unknown>)
      : (data as Record<string, unknown> | null);
  if (!record || typeof record !== 'object') {
    throw new Error('Adding grocery haul sources returned no result.');
  }
  const outcome = record.outcome === 'updated' || record.outcome === 'noop'
    ? record.outcome
    : null;
  const sourceIds = Array.isArray(record.source_grocery_list_ids)
    ? record.source_grocery_list_ids.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
    : [];
  const addedSourceCount = finiteNumber(record.added_source_count);
  const itemCount = finiteNumber(record.item_count);
  if (
    typeof record.haul_id !== 'string'
    || !outcome
    || addedSourceCount == null
    || itemCount == null
  ) {
    throw new Error('Adding grocery haul sources returned an incomplete result.');
  }
  return {
    haul_id: record.haul_id,
    source_grocery_list_ids: sourceIds,
    added_source_count: Math.floor(addedSourceCount),
    item_count: Math.floor(itemCount),
    outcome,
  };
}

async function loadOpenHaulForListDate(args: {
  personId: string;
  listId: string;
  shoppingDate: string;
}): Promise<GroceryHaulCreateResult | null> {
  const { data: haul, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('*')
    .eq('person_id', args.personId)
    .eq('source_grocery_list_id', args.listId)
    .eq('shopping_date', args.shoppingDate)
    .in('status', [...GROCERY_HAUL_OPEN_STATUSES])
    .maybeSingle();
  if (error) throw new Error(`Failed to load existing grocery haul: ${error.message}`);
  if (!haul) return null;

  const { count, error: countErr } = await supabaseAdmin
    .from('grocery_haul_items')
    .select('id', { count: 'exact', head: true })
    .eq('haul_id', haul.id)
    .eq('person_id', args.personId);
  if (countErr) throw new Error(`Failed to load grocery haul items: ${countErr.message}`);

  const status: GroceryHaulStatus = isGroceryHaulStatus(String(haul.status))
    ? (haul.status as GroceryHaulStatus)
    : 'planned';
  return {
    haul_id: String(haul.id),
    person_id: String(haul.person_id),
    source_grocery_list_id: String(haul.source_grocery_list_id),
    source_grocery_list_ids: [String(haul.source_grocery_list_id)],
    shopping_date: String(haul.shopping_date),
    status,
    creation_token: String(haul.creation_token),
    item_count: count ?? 0,
    outcome: 'reused',
  };
}

export async function createGroceryHaulFromList(args: {
  personId: string;
  listId: string;
  shoppingDate: string;
  creationToken: string;
}): Promise<GroceryHaulCreateResult> {
  if (!isGroceryHaulShoppingDate(args.shoppingDate)) {
    throw new GroceryHaulValidationError('shopping_date must be a calendar date (YYYY-MM-DD).');
  }
  if (!isGroceryHaulCreationToken(args.creationToken)) {
    throw new GroceryHaulValidationError('creation_token must be a UUID.');
  }

  let items: GroceryItem[];
  let list;
  try {
    const detail = await getPersistentGroceryListDetail(args.personId, args.listId);
    list = detail.list;
    items = detail.items;
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) throw err;
    throw err;
  }

  const readiness = evaluateGroceryListReadiness({ items });
  const eligibility = resolveGroceryHaulCreateEligibility({
    archivedAt: list.archived_at,
    readinessState: readiness.state,
  });
  if (!eligibility.eligible) {
    throw new GroceryHaulBlockedError(
      eligibility.blockReason,
      BLOCK_COPY[eligibility.blockReason] ?? 'This list cannot start a shopping trip yet.',
    );
  }

  const { data, error } = await supabaseAdmin.rpc(GROCERY_HAUL_CREATE_RPC_NAME, {
    p_person_id: args.personId,
    p_source_grocery_list_id: args.listId,
    p_shopping_date: args.shoppingDate,
    p_creation_token: args.creationToken,
  });

  if (!error) {
    return parseCreateResult(data);
  }

  const message = rpcMessage(error);
  if (message.includes('HAUL_CREATE_OPEN_EXISTS')) {
    const existing = await loadOpenHaulForListDate({
      personId: args.personId,
      listId: args.listId,
      shoppingDate: args.shoppingDate,
    });
    if (existing) return existing;
    throw new GroceryHaulConflictError('An open shopping trip already exists for this list and date.');
  }
  if (message.includes('HAUL_CREATE_NO_PENDING_ITEMS')) {
    throw new GroceryHaulBlockedError('no_pending', BLOCK_COPY.no_pending);
  }
  if (message.includes('HAUL_CREATE_TOKEN_MISMATCH')) {
    throw new GroceryHaulConflictError(BLOCK_COPY.token_mismatch);
  }
  if (message.includes('HAUL_CREATE_LIST_NOT_FOUND')) {
    throw new GroceryListNotFoundError('Grocery list not found.');
  }
  if (message.includes('HAUL_CREATE_FORBIDDEN')) {
    throw new GroceryHaulForbiddenError('Not allowed to create a shopping trip for this list.');
  }
  if (message.includes('HAUL_CREATE_INVALID_ARGS') || message.includes('HAUL_CREATE_TOKEN_RACE')) {
    throw new GroceryHaulValidationError('Could not start this shopping trip. Refresh and try again.');
  }
  throw new Error(`Failed to create grocery haul: ${message}`);
}

export function normalizeGroceryHaulSourceListIds(listIds: readonly string[]): string[] {
  return Array.from(
    new Set(
      listIds
        .map((listId) => listId.trim())
        .filter(Boolean),
    ),
  );
}

export async function createGroceryHaulFromLists(args: {
  personId: string;
  listIds: readonly string[];
  shoppingDate: string;
  creationToken: string;
}): Promise<GroceryHaulCreateResult> {
  if (!isGroceryHaulShoppingDate(args.shoppingDate)) {
    throw new GroceryHaulValidationError('shopping_date must be a calendar date (YYYY-MM-DD).');
  }
  if (!isGroceryHaulCreationToken(args.creationToken)) {
    throw new GroceryHaulValidationError('creation_token must be a UUID.');
  }

  const listIds = normalizeGroceryHaulSourceListIds(args.listIds);
  if (listIds.length === 0) {
    throw new GroceryHaulValidationError('At least one source grocery list is required.');
  }

  for (const listId of listIds) {
    const detail = await getPersistentGroceryListDetail(args.personId, listId);
    const readiness = evaluateGroceryListReadiness({ items: detail.items });
    const eligibility = resolveGroceryHaulCreateEligibility({
      archivedAt: detail.list.archived_at,
      readinessState: readiness.state,
    });
    if (!eligibility.eligible) {
      throw new GroceryHaulBlockedError(
        eligibility.blockReason,
        BLOCK_COPY[eligibility.blockReason] ?? 'This list cannot start a shopping trip yet.',
      );
    }
  }

  const { data, error } = await supabaseAdmin.rpc(GROCERY_HAUL_CREATE_MULTI_RPC_NAME, {
    p_person_id: args.personId,
    p_source_grocery_list_ids: listIds,
    p_shopping_date: args.shoppingDate,
    p_creation_token: args.creationToken,
  });

  if (!error) {
    return parseCreateResult(data);
  }

  const message = rpcMessage(error);
  if (message.includes('HAUL_CREATE_NO_PENDING_ITEMS')) {
    throw new GroceryHaulBlockedError('no_pending', BLOCK_COPY.no_pending);
  }
  if (
    message.includes('HAUL_CREATE_OPEN_EXISTS')
    || message.includes('HAUL_CREATE_TOKEN_MISMATCH')
  ) {
    throw new GroceryHaulConflictError(
      message.includes('HAUL_CREATE_TOKEN_MISMATCH')
        ? BLOCK_COPY.token_mismatch
        : 'An open shopping trip already exists for the primary source list and date.',
    );
  }
  if (message.includes('HAUL_CREATE_LIST_NOT_FOUND')) {
    throw new GroceryListNotFoundError('One or more grocery lists were not found.');
  }
  if (message.includes('HAUL_CREATE_FORBIDDEN')) {
    throw new GroceryHaulForbiddenError('Not allowed to create a shopping trip for these lists.');
  }
  if (message.includes('HAUL_CREATE_INVALID_ARGS') || message.includes('HAUL_CREATE_TOKEN_RACE')) {
    throw new GroceryHaulValidationError('Could not start this shopping trip. Refresh and try again.');
  }
  throw new Error(`Failed to create grocery haul: ${message}`);
}

async function loadOwnedHaul(personId: string, haulId: string): Promise<GroceryHaul> {
  const { data, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('*')
    .eq('id', haulId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery haul: ${error.message}`);
  if (!data) throw new GroceryHaulNotFoundError('Grocery haul not found.');
  return mapHaul(data as Record<string, unknown>);
}

function assertPreparationMutable(haul: GroceryHaul): void {
  if (haul.status !== 'planned') {
    throw new GroceryHaulConflictError('Only Draft grocery hauls can be edited.');
  }
}

export async function updateGroceryHaulMetadata(args: {
  personId: string;
  haulId: string;
  title?: string;
  shoppingDate?: string;
  budgetAmount?: number | null;
  currency?: string;
}): Promise<GroceryHaul> {
  const haul = await loadOwnedHaul(args.personId, args.haulId);
  assertPreparationMutable(haul);

  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) {
    const title = args.title.trim();
    if (!title) throw new GroceryHaulValidationError('title must not be blank.');
    patch.title = title;
  }
  if (args.shoppingDate !== undefined) {
    if (!isGroceryHaulShoppingDate(args.shoppingDate)) {
      throw new GroceryHaulValidationError('shopping_date must be a calendar date (YYYY-MM-DD).');
    }
    patch.shopping_date = args.shoppingDate;
  }
  if (args.budgetAmount !== undefined) {
    if (
      args.budgetAmount !== null
      && (!Number.isFinite(args.budgetAmount) || args.budgetAmount < 0)
    ) {
      throw new GroceryHaulValidationError('budget_amount must be null or nonnegative.');
    }
    patch.budget_amount = args.budgetAmount;
  }
  if (args.currency !== undefined) {
    if (!isGroceryHaulCurrency(args.currency)) {
      throw new GroceryHaulValidationError('currency must be an uppercase ISO 4217 code.');
    }
    patch.currency = args.currency;
  }
  if (Object.keys(patch).length === 0) {
    throw new GroceryHaulValidationError('At least one Haul metadata field is required.');
  }

  const { data, error } = await supabaseAdmin
    .from('grocery_hauls')
    .update(patch)
    .eq('id', args.haulId)
    .eq('person_id', args.personId)
    .eq('status', 'planned')
    .select('*')
    .maybeSingle();
  if (error) {
    if (
      error.message.includes('HAUL_PREPARATION_NOT_DRAFT')
      || error.message.includes('HAUL_STATUS_HISTORICAL')
    ) {
      throw new GroceryHaulConflictError('Only Draft grocery hauls can be edited.');
    }
    if (
      error.code === '23505'
      || error.message.includes('idx_grocery_hauls_open_list_date')
    ) {
      throw new GroceryHaulConflictError(
        'An open grocery haul already exists for this primary source List and date.',
      );
    }
    throw new Error(`Failed to update grocery haul metadata: ${error.message}`);
  }
  if (!data) throw new GroceryHaulConflictError('This grocery haul is no longer editable.');
  return mapHaul(data as Record<string, unknown>);
}

export type GroceryHaulItemPreparationPatch = {
  finalQuantity?: number;
  selectedFoodObjectId?: string | null;
  productTitle?: string | null;
  brandName?: string | null;
  purchaseUnit?: string | null;
  packageSize?: number | null;
  packageUnit?: string | null;
  packageCount?: number | null;
  retailer?: string | null;
  storeLocation?: string | null;
  postalCode?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  sourcePriceObservationId?: string | null;
};

function nullableText(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function updateGroceryHaulItemPreparation(args: {
  personId: string;
  haulId: string;
  itemId: string;
  patch: GroceryHaulItemPreparationPatch;
}): Promise<GroceryHaulItem> {
  const haul = await loadOwnedHaul(args.personId, args.haulId);
  assertPreparationMutable(haul);
  const { data: currentItem, error: currentItemError } = await supabaseAdmin
    .from('grocery_haul_items')
    .select('*')
    .eq('id', args.itemId)
    .eq('haul_id', args.haulId)
    .eq('person_id', args.personId)
    .maybeSingle();
  if (currentItemError) {
    throw new Error(`Failed to load grocery haul item: ${currentItemError.message}`);
  }
  if (!currentItem) throw new GroceryHaulNotFoundError('Grocery haul item not found.');

  const contextEdited = [
    args.patch.selectedFoodObjectId,
    args.patch.productTitle,
    args.patch.brandName,
    args.patch.purchaseUnit,
    args.patch.packageSize,
    args.patch.packageUnit,
    args.patch.packageCount,
    args.patch.retailer,
    args.patch.storeLocation,
    args.patch.postalCode,
  ].some((value) => value !== undefined);
  if (args.patch.sourcePriceObservationId !== undefined && contextEdited) {
    throw new GroceryHaulValidationError(
      'A sourced price selection cannot include manual product or store overrides.',
    );
  }
  if (
    args.patch.sourcePriceObservationId !== undefined
    && args.patch.priceAmount !== undefined
  ) {
    throw new GroceryHaulValidationError(
      'Choose either a sourced price observation or an explicit manual price.',
    );
  }

  const patch: Record<string, unknown> = {};

  if (args.patch.sourcePriceObservationId !== undefined) {
    if (args.patch.sourcePriceObservationId === null) {
      patch.price_amount = null;
      patch.price_currency = null;
      patch.price_source = null;
      patch.price_retrieved_at = null;
      patch.source_price_observation_id = null;
    } else {
      if (!currentItem.grocery_item_id) {
        throw new GroceryHaulValidationError(
          'A detached historical item cannot select a List price observation.',
        );
      }
      const { data: observation, error: observationError } = await supabaseAdmin
        .from('grocery_list_price_observations')
        .select('*')
        .eq('id', args.patch.sourcePriceObservationId)
        .eq('person_id', args.personId)
        .eq('grocery_list_id', currentItem.source_grocery_list_id)
        .eq('grocery_item_id', currentItem.grocery_item_id)
        .maybeSingle();
      if (observationError) {
        throw new Error(`Failed to load grocery price observation: ${observationError.message}`);
      }
      if (!observation) {
        throw new GroceryHaulValidationError('Selected price observation is not valid for this item.');
      }
      patch.product_title = observation.product_title;
      patch.brand_name = observation.brand_name;
      patch.package_size = observation.package_size;
      patch.package_unit = observation.package_unit;
      patch.package_count = observation.package_count;
      patch.retailer = observation.retailer;
      patch.postal_code = observation.postal_code;
      patch.price_amount = observation.unit_price;
      patch.price_currency = observation.currency;
      patch.price_source = observation.source === 'manual' ? 'manual' : 'sourced';
      patch.price_retrieved_at = observation.retrieved_at;
      patch.source_price_observation_id = observation.id;
    }
  }

  if (args.patch.finalQuantity !== undefined) {
    if (!Number.isFinite(args.patch.finalQuantity) || args.patch.finalQuantity < 0) {
      throw new GroceryHaulValidationError('final_quantity must be nonnegative.');
    }
    patch.final_quantity = args.patch.finalQuantity;
  }
  const textFields: Array<[keyof GroceryHaulItemPreparationPatch, string]> = [
    ['productTitle', 'product_title'],
    ['brandName', 'brand_name'],
    ['purchaseUnit', 'purchase_unit'],
    ['packageUnit', 'package_unit'],
    ['retailer', 'retailer'],
    ['storeLocation', 'store_location'],
    ['postalCode', 'postal_code'],
  ];
  for (const [inputKey, column] of textFields) {
    const value = args.patch[inputKey];
    if (typeof value === 'string' || value === null) patch[column] = nullableText(value);
  }
  if (args.patch.selectedFoodObjectId !== undefined) {
    patch.selected_food_object_id = nullableText(args.patch.selectedFoodObjectId);
  }
  for (const [inputKey, column] of [
    ['packageSize', 'package_size'],
    ['packageCount', 'package_count'],
  ] as const) {
    const value = args.patch[inputKey];
    if (value !== undefined) {
      if (value !== null && (!Number.isFinite(value) || value <= 0)) {
        throw new GroceryHaulValidationError(`${column} must be null or positive.`);
      }
      patch[column] = value;
    }
  }

  if (
    contextEdited
    && args.patch.sourcePriceObservationId === undefined
    && currentItem.price_source === 'sourced'
  ) {
    patch.price_amount = null;
    patch.price_currency = null;
    patch.price_source = null;
    patch.price_retrieved_at = null;
    patch.source_price_observation_id = null;
  }

  if (args.patch.priceAmount !== undefined) {
    if (
      args.patch.priceAmount !== null
      && (!Number.isFinite(args.patch.priceAmount) || args.patch.priceAmount < 0)
    ) {
      throw new GroceryHaulValidationError('price_amount must be null or nonnegative.');
    }
    patch.price_amount = args.patch.priceAmount;
    if (args.patch.priceAmount === null) {
      patch.price_currency = null;
      patch.price_source = null;
      patch.price_retrieved_at = null;
      patch.source_price_observation_id = null;
    } else {
      const priceCurrency = args.patch.priceCurrency ?? haul.currency;
      if (!isGroceryHaulCurrency(priceCurrency)) {
        throw new GroceryHaulValidationError('price_currency must be an uppercase ISO 4217 code.');
      }
      patch.price_currency = priceCurrency;
      patch.price_source = 'manual';
      patch.price_retrieved_at = null;
      patch.source_price_observation_id = null;
    }
  } else if (args.patch.priceCurrency !== undefined) {
    throw new GroceryHaulValidationError(
      'price_currency requires price_amount in the same update.',
    );
  }
  if (Object.keys(patch).length === 0) {
    throw new GroceryHaulValidationError('At least one Haul item preparation field is required.');
  }
  patch.resolution_source = 'haul_edit';

  const { data, error } = await supabaseAdmin
    .from('grocery_haul_items')
    .update(patch)
    .eq('id', args.itemId)
    .eq('haul_id', args.haulId)
    .eq('person_id', args.personId)
    .select('*')
    .maybeSingle();
  if (error) {
    if (error.message.includes('HAUL_PREPARATION_NOT_DRAFT')) {
      throw new GroceryHaulConflictError('Only Draft grocery hauls can be edited.');
    }
    throw new Error(`Failed to update grocery haul item: ${error.message}`);
  }
  if (!data) throw new GroceryHaulNotFoundError('Grocery haul item not found.');
  return mapHaulItem(data as Record<string, unknown>);
}

export async function addGroceryListsToDraftHaul(args: {
  personId: string;
  haulId: string;
  listIds: readonly string[];
}): Promise<GroceryHaulAddSourcesResult> {
  const listIds = normalizeGroceryHaulSourceListIds(args.listIds);
  if (listIds.length === 0) {
    throw new GroceryHaulValidationError('At least one source grocery list is required.');
  }
  const { data, error } = await supabaseAdmin.rpc(GROCERY_HAUL_ADD_LISTS_RPC_NAME, {
    p_person_id: args.personId,
    p_haul_id: args.haulId,
    p_source_grocery_list_ids: listIds,
  });
  if (!error) return parseAddSourcesResult(data);

  const message = rpcMessage(error);
  if (message.includes('HAUL_ADD_LISTS_NOT_FOUND')) {
    throw new GroceryHaulNotFoundError('Grocery haul not found.');
  }
  if (message.includes('HAUL_ADD_LISTS_LIST_NOT_FOUND')) {
    throw new GroceryListNotFoundError('One or more active grocery lists were not found.');
  }
  if (message.includes('HAUL_ADD_LISTS_FORBIDDEN')) {
    throw new GroceryHaulForbiddenError('Not allowed to add sources to this grocery haul.');
  }
  if (message.includes('HAUL_ADD_LISTS_NOT_DRAFT')) {
    throw new GroceryHaulConflictError('Only Draft grocery hauls can add source lists.');
  }
  if (message.includes('HAUL_ADD_LISTS_INVALID_ARGS')) {
    throw new GroceryHaulValidationError('Could not add source lists to this grocery haul.');
  }
  throw new Error(`Failed to add grocery haul sources: ${message}`);
}

/**
 * Packet 11E — read-only Haul collection for a person.
 *
 * Returns lightweight presentation items for both the /app/food/groceries
 * Hauls section and the /app/food/hauls collection page. Never mutates any
 * table. Resolves source list names with a single batched query (no N+1).
 *
 * Scoped strictly to the authenticated person. Returns at most 100 rows,
 * ordered most-recent-first.
 *
 * 11E-R3: An unrecognised persisted status fails the entire collection read
 * with a clear error rather than coercing to a fabricated canonical value.
 *
 * 11E-R4: A failed item-count query fails the collection read. Zero items is
 * meaningful canonical truth and must not stand in for "count unavailable."
 * Source-list-name resolution failure is non-fatal: the name degrades to null
 * (rendered as a generic label by the UI) because the label is cosmetic and
 * the Haul identity (id, status, shopping_date) remains authoritative.
 */
export async function listGroceryHaulsForPerson(
  personId: string,
): Promise<GroceryHaulCollectionItem[]> {
  const { data: hauls, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('id, source_grocery_list_id, title, shopping_date, status, budget_amount, currency, created_at, updated_at')
    .eq('person_id', personId)
    .order('shopping_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Failed to load grocery hauls: ${error.message}`);
  if (!hauls || hauls.length === 0) return [];

  // 11E-R3: Validate every status before proceeding. An unknown persisted
  // status means the read-model cannot be trusted; fail the whole collection.
  for (const h of hauls) {
    const rawStatus = String(h.status);
    if (!isGroceryHaulStatus(rawStatus)) {
      throw new Error(
        `Grocery haul ${String(h.id)} has unrecognised status "${rawStatus}". Collection read aborted.`,
      );
    }
  }

  const haulIds = hauls.map((haul) => String(haul.id));
  const { data: memberships, error: membershipsErr } = await supabaseAdmin
    .from('grocery_haul_source_lists')
    .select('haul_id, grocery_list_id, created_at')
    .in('haul_id', haulIds)
    .eq('person_id', personId)
    .order('created_at', { ascending: true });
  if (membershipsErr) {
    throw new Error(`Failed to load grocery haul source memberships: ${membershipsErr.message}`);
  }

  const listIdsByHaul = new Map<string, string[]>();
  for (const row of memberships ?? []) {
    const haulId = String(row.haul_id);
    const current = listIdsByHaul.get(haulId) ?? [];
    current.push(String(row.grocery_list_id));
    listIdsByHaul.set(haulId, current);
  }
  for (const haul of hauls) {
    const haulId = String(haul.id);
    const primaryId = String(haul.source_grocery_list_id);
    const current = listIdsByHaul.get(haulId) ?? [];
    if (!current.includes(primaryId)) current.unshift(primaryId);
    listIdsByHaul.set(haulId, current);
  }
  const listIds = Array.from(new Set(Array.from(listIdsByHaul.values()).flat()));

  // Source-list-name resolution: non-fatal. If the lookup fails or the list
  // record is absent, source_list_name degrades to null (UI renders a generic
  // label). This is intentional and documented behaviour.
  const { data: lists, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('id, title')
    .in('id', listIds)
    .eq('person_id', personId);

  const listNameMap = new Map<string, string | null>();
  if (!listErr && lists) {
    for (const list of lists) {
      listNameMap.set(String(list.id), list.title ? String(list.title) : null);
    }
  }
  // listErr is intentionally not thrown — name is cosmetic, not authoritative.

  // Item rows are loaded once for every collection Haul. This preserves the
  // no-N+1 collection contract while deriving presentation totals from the
  // same persisted preparation fields as the canonical detail estimate.
  const { data: itemRows, error: itemErr } = await supabaseAdmin
    .from('grocery_haul_items')
    .select('*')
    .in('haul_id', haulIds)
    .eq('person_id', personId);

  if (itemErr) {
    throw new Error(`Failed to load grocery haul item summaries: ${itemErr.message}`);
  }

  const itemsByHaul = new Map<string, GroceryHaulItem[]>();
  for (const row of (itemRows ?? []) as Array<Record<string, unknown>>) {
    const item = mapHaulItem(row);
    const current = itemsByHaul.get(item.haul_id) ?? [];
    current.push(item);
    itemsByHaul.set(item.haul_id, current);
  }

  return hauls.map((h) => {
    const haulId = String(h.id);
    const listId = String(h.source_grocery_list_id);
    const currency = String(h.currency ?? 'USD');
    const items = itemsByHaul.get(haulId) ?? [];
    const estimate = computeGroceryHaulPreparationEstimate(currency, items);
    const sourceListNames = (listIdsByHaul.get(haulId) ?? [])
      .map((sourceId) => listNameMap.get(sourceId)?.trim() || null)
      .filter((name): name is string => Boolean(name));
    const storeNames = Array.from(new Set(
      items
        .filter((item) => item.final_quantity > 0)
        .map((item) => item.store_location?.trim() || item.retailer?.trim() || null)
        .filter((name): name is string => Boolean(name)),
    ));
    // Status validity already verified above; cast is safe.
    const status = String(h.status) as GroceryHaulStatus;
    return {
      id: haulId,
      source_grocery_list_id: listId,
      source_list_name: listNameMap.get(listId) ?? null,
      source_list_names: sourceListNames,
      title: h.title ? String(h.title) : null,
      shopping_date: String(h.shopping_date),
      status,
      item_count: items.length,
      execution_item_count: estimate.execution_item_count,
      unpriced_item_count: estimate.unpriced_item_count,
      estimated_total: estimate.estimated_total,
      currency,
      budget_amount: h.budget_amount == null ? null : Number(h.budget_amount),
      store_names: storeNames,
      created_at: String(h.created_at),
      updated_at: String(h.updated_at ?? h.created_at),
    };
  });
}

export async function getGroceryHaulDetail(
  personId: string,
  haulId: string,
): Promise<GroceryHaulDetail> {
  const { data: haul, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('*')
    .eq('id', haulId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery haul: ${error.message}`);
  if (!haul) throw new GroceryHaulNotFoundError('Grocery haul not found.');

  const { data: memberships, error: membershipsErr } = await supabaseAdmin
    .from('grocery_haul_source_lists')
    .select('*')
    .eq('haul_id', haulId)
    .eq('person_id', personId)
    .order('created_at', { ascending: true });
  if (membershipsErr) {
    throw new Error(`Failed to load grocery haul source lists: ${membershipsErr.message}`);
  }

  const membershipRows = (memberships ?? []) as Array<Record<string, unknown>>;
  const sourceListIds = Array.from(
    new Set(membershipRows.map((row) => String(row.grocery_list_id))),
  );
  const listTitles = new Map<string, string | null>();
  if (sourceListIds.length > 0) {
    const { data: sourceLists, error: sourceListsErr } = await supabaseAdmin
      .from('generated_grocery_lists')
      .select('id, title')
      .eq('person_id', personId)
      .in('id', sourceListIds);
    if (sourceListsErr) {
      throw new Error(`Failed to load grocery haul source names: ${sourceListsErr.message}`);
    }
    for (const source of sourceLists ?? []) {
      listTitles.set(String(source.id), source.title ? String(source.title) : null);
    }
  }

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('grocery_haul_items')
    .select('*')
    .eq('haul_id', haulId)
    .eq('person_id', personId)
    .order('created_at', { ascending: true });
  if (itemsErr) throw new Error(`Failed to load grocery haul items: ${itemsErr.message}`);

  const mappedHaul = mapHaul(haul as Record<string, unknown>);
  const mappedItems = ((items ?? []) as Array<Record<string, unknown>>).map(mapHaulItem);
  return {
    haul: mappedHaul,
    source_lists: membershipRows.map((membership) => ({
      haul_id: String(membership.haul_id),
      grocery_list_id: String(membership.grocery_list_id),
      person_id: String(membership.person_id),
      created_at: String(membership.created_at),
      title: listTitles.get(String(membership.grocery_list_id)) ?? null,
    })),
    items: mappedItems,
    estimate: computeGroceryHaulPreparationEstimate(mappedHaul.currency, mappedItems),
  };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  const record = typeof value === 'string'
    ? (JSON.parse(value) as Record<string, unknown>)
    : value as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') throw new Error(message);
  return record;
}

function parseExecutionFinding(value: unknown): GroceryHaulExecutionFinding {
  const finding = value as Record<string, unknown>;
  return {
    code: String(finding.code) as GroceryHaulExecutionFinding['code'],
    severity: String(finding.severity) as GroceryHaulExecutionFinding['severity'],
    ...(typeof finding.haul_item_id === 'string'
      ? { haul_item_id: finding.haul_item_id }
      : {}),
    message: String(finding.message ?? ''),
  };
}

function parseExecutionReadiness(data: unknown): GroceryHaulExecutionReadiness {
  const record = asRecord(data, 'Grocery haul execution readiness returned no result.');
  const status = String(record.status ?? '');
  if (
    typeof record.haul_id !== 'string'
    || !isGroceryHaulStatus(status)
    || typeof record.can_start !== 'boolean'
    || finiteNumber(record.executable_item_count) == null
    || !Array.isArray(record.blockers)
    || !Array.isArray(record.warnings)
    || !Array.isArray(record.deferred_findings)
  ) {
    throw new Error('Grocery haul execution readiness returned an incomplete result.');
  }
  return {
    haul_id: record.haul_id,
    status,
    can_start: record.can_start,
    executable_item_count: Math.floor(finiteNumber(record.executable_item_count) ?? 0),
    blockers: record.blockers.map(parseExecutionFinding),
    warnings: record.warnings.map(parseExecutionFinding),
    deferred_findings: record.deferred_findings.map((value) => {
      const finding = value as Record<string, unknown>;
      return {
        code: String(finding.code) as GroceryHaulExecutionReadiness['deferred_findings'][number]['code'],
        evaluation: 'not_evaluated',
      };
    }),
  };
}

function throwExecutionRpcError(message: string): never {
  if (message.includes('HAUL_EXECUTION_FORBIDDEN')) {
    throw new GroceryHaulForbiddenError('Not allowed to access this grocery haul execution.');
  }
  if (message.includes('HAUL_EXECUTION_NOT_FOUND')) {
    throw new GroceryHaulNotFoundError('Grocery haul not found.');
  }
  if (message.includes('HAUL_EXECUTION_ZERO_ITEMS')) {
    throw new GroceryHaulBlockedError(
      'zero_executable_items',
      'At least one item must have final_quantity greater than zero.',
    );
  }
  if (
    message.includes('HAUL_EXECUTION_HISTORICAL')
    || message.includes('HAUL_EXECUTION_INVALID_STATUS')
    || message.includes('HAUL_EXECUTION_INCOMPLETE')
  ) {
    throw new GroceryHaulConflictError('This grocery haul cannot enter Shopping View.');
  }
  if (message.includes('HAUL_EXECUTION_INVALID_ARGS')) {
    throw new GroceryHaulValidationError('A person and grocery haul are required.');
  }
  throw new Error(`Grocery haul execution operation failed: ${message}`);
}

export async function getGroceryHaulExecutionReadiness(
  personId: string,
  haulId: string,
): Promise<GroceryHaulExecutionReadiness> {
  const { data, error } = await supabaseAdmin.rpc(
    GROCERY_HAUL_EXECUTION_READINESS_RPC_NAME,
    { p_person_id: personId, p_haul_id: haulId },
  );
  if (error) throwExecutionRpcError(rpcMessage(error));
  return parseExecutionReadiness(data);
}

export async function startGroceryHaulExecution(args: {
  personId: string;
  haulId: string;
}): Promise<GroceryHaulExecutionStartResult> {
  const { data, error } = await supabaseAdmin.rpc(
    GROCERY_HAUL_EXECUTION_START_RPC_NAME,
    { p_person_id: args.personId, p_haul_id: args.haulId },
  );
  if (error) throwExecutionRpcError(rpcMessage(error));
  const record = asRecord(data, 'Starting grocery haul execution returned no result.');
  const itemCount = finiteNumber(record.item_count);
  if (
    typeof record.haul_id !== 'string'
    || record.status !== 'active'
    || typeof record.shopping_started_at !== 'string'
    || itemCount == null
    || (record.outcome !== 'started' && record.outcome !== 'already_active')
  ) {
    throw new Error('Starting grocery haul execution returned an incomplete result.');
  }
  return {
    haul_id: record.haul_id,
    status: 'active',
    shopping_started_at: record.shopping_started_at,
    item_count: Math.floor(itemCount),
    outcome: record.outcome,
  };
}

function mapExecutionItem(
  row: Record<string, unknown>,
  sourceListTitle: string | null = null,
): GroceryHaulExecutionItem {
  const numericFields = [
    'source_quantity_snapshot',
    'prepared_quantity',
    'prepared_package_size',
    'prepared_package_count',
    'prepared_price_amount',
    'acquired_quantity',
    'acquired_package_size',
    'acquired_package_count',
    'acquired_price_amount',
  ] as const;
  const mapped = {
    ...row,
    source_list_title: sourceListTitle,
  } as unknown as GroceryHaulExecutionItem;
  for (const field of numericFields) {
    (mapped[field] as number | null) = finiteNumber(row[field]);
  }
  return mapped;
}

export async function getGroceryHaulExecution(
  personId: string,
  haulId: string,
): Promise<GroceryHaulExecutionDetail> {
  const haul = await loadOwnedHaul(personId, haulId);
  if (haul.status !== 'active') {
    throw new GroceryHaulConflictError('Shopping View is available only for active grocery hauls.');
  }

  const { data: rows, error } = await supabaseAdmin
    .from('grocery_haul_execution_items')
    .select('*')
    .eq('haul_id', haulId)
    .eq('person_id', personId)
    .order('sort_ordinal', { ascending: true });
  if (error) throw new Error(`Failed to load grocery haul execution items: ${error.message}`);

  const rawRows = (rows ?? []) as Array<Record<string, unknown>>;
  const sourceListIds = Array.from(new Set(
    rawRows.map((row) => String(row.source_grocery_list_id)),
  ));
  const sourceTitles = new Map<string, string | null>();
  if (sourceListIds.length > 0) {
    const { data: lists, error: listsError } = await supabaseAdmin
      .from('generated_grocery_lists')
      .select('id, title')
      .eq('person_id', personId)
      .in('id', sourceListIds);
    if (listsError) {
      throw new Error(`Failed to load grocery haul execution source names: ${listsError.message}`);
    }
    for (const list of lists ?? []) {
      sourceTitles.set(String(list.id), list.title ? String(list.title) : null);
    }
  }
  const items = rawRows.map((row) => mapExecutionItem(
    row,
    sourceTitles.get(String(row.source_grocery_list_id)) ?? null,
  ));
  const readiness = await getGroceryHaulExecutionReadiness(personId, haulId);
  return {
    haul,
    summary: {
      haul_id: haulId,
      status: haul.status,
      shopping_started_at: haul.shopping_started_at,
      total_count: items.length,
      pending_count: items.filter((item) => item.state === 'pending').length,
      in_basket_count: items.filter((item) => item.state === 'in_basket').length,
      skipped_count: items.filter((item) => item.state === 'skipped').length,
    },
    items,
    readiness,
  };
}

function validateOptionalNonnegative(value: number | null | undefined, field: string): void {
  if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new GroceryHaulValidationError(`${field} must be null or nonnegative.`);
  }
}

function validateOptionalPositive(value: number | null | undefined, field: string): void {
  if (value !== undefined && value !== null && (!Number.isFinite(value) || value <= 0)) {
    throw new GroceryHaulValidationError(`${field} must be null or positive.`);
  }
}

export async function updateGroceryHaulExecutionItem(args: {
  personId: string;
  haulId: string;
  executionItemId: string;
  state?: GroceryHaulExecutionItemState;
  acquisition?: GroceryHaulAcquisitionPatch;
}): Promise<GroceryHaulExecutionItem> {
  const haul = await loadOwnedHaul(args.personId, args.haulId);
  if (haul.status !== 'active') {
    throw new GroceryHaulConflictError('Execution items can be changed only on an active Haul.');
  }
  if (
    args.state !== undefined
    && !(['pending', 'in_basket', 'skipped'] as const).includes(args.state)
  ) {
    throw new GroceryHaulValidationError('Invalid grocery haul execution state.');
  }
  const acquisition = args.acquisition ?? {};
  validateOptionalNonnegative(acquisition.quantity, 'acquisition quantity');
  validateOptionalPositive(acquisition.package_size, 'acquisition package_size');
  validateOptionalPositive(acquisition.package_count, 'acquisition package_count');
  validateOptionalNonnegative(acquisition.price_amount, 'acquisition price_amount');
  if (
    acquisition.price_currency !== undefined
    && acquisition.price_currency !== null
    && !isGroceryHaulCurrency(acquisition.price_currency)
  ) {
    throw new GroceryHaulValidationError(
      'acquisition price_currency must be an uppercase ISO 4217 code.',
    );
  }

  const patch: Record<string, unknown> = {};
  if (args.state !== undefined) patch.state = args.state;
  const fieldMap: Array<[keyof GroceryHaulAcquisitionPatch, string]> = [
    ['quantity', 'acquired_quantity'],
    ['food_object_id', 'acquired_food_object_id'],
    ['product_title', 'acquired_product_title'],
    ['brand_name', 'acquired_brand_name'],
    ['purchase_unit', 'acquired_purchase_unit'],
    ['package_size', 'acquired_package_size'],
    ['package_unit', 'acquired_package_unit'],
    ['package_count', 'acquired_package_count'],
    ['retailer', 'acquired_retailer'],
    ['store_location', 'acquired_store_location'],
    ['postal_code', 'acquired_postal_code'],
    ['price_amount', 'acquired_price_amount'],
    ['price_currency', 'acquired_price_currency'],
  ];
  for (const [inputField, column] of fieldMap) {
    if (acquisition[inputField] !== undefined) {
      const value = acquisition[inputField];
      patch[column] = typeof value === 'string' || value === null
        ? nullableText(value as string | null)
        : value;
    }
  }
  if (acquisition.price_amount === null) patch.acquired_price_currency = null;
  if (
    typeof acquisition.price_amount === 'number'
    && acquisition.price_currency === undefined
  ) {
    patch.acquired_price_currency = haul.currency;
  }
  if (Object.keys(patch).length === 0) {
    throw new GroceryHaulValidationError(
      'An execution state or acquisition outcome field is required.',
    );
  }

  const { data, error } = await supabaseAdmin
    .from('grocery_haul_execution_items')
    .update(patch)
    .eq('id', args.executionItemId)
    .eq('haul_id', args.haulId)
    .eq('person_id', args.personId)
    .select('*')
    .maybeSingle();
  if (error) {
    if (
      error.message.includes('HAUL_EXECUTION_NOT_ACTIVE')
      || error.message.includes('HAUL_EXECUTION_INVALID_TRANSITION')
    ) {
      throw new GroceryHaulConflictError('This execution transition is no longer valid.');
    }
    if (error.message.includes('HAUL_EXECUTION_SNAPSHOT_IMMUTABLE')) {
      throw new GroceryHaulConflictError('Prepared execution snapshots cannot be changed.');
    }
    throw new Error(`Failed to update grocery haul execution item: ${error.message}`);
  }
  if (!data) throw new GroceryHaulNotFoundError('Grocery haul execution item not found.');
  return mapExecutionItem(data as Record<string, unknown>);
}
