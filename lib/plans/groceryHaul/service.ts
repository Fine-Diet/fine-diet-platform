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
  GroceryHaulCreateResult,
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
  GROCERY_HAUL_CREATE_RPC_NAME,
  GROCERY_HAUL_OPEN_STATUSES,
  isGroceryHaulCreationToken,
  isGroceryHaulShoppingDate,
  isGroceryHaulStatus,
} from './schema';

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
  const shoppingDate = typeof record.shopping_date === 'string' ? record.shopping_date : '';
  const status = typeof record.status === 'string' && isGroceryHaulStatus(record.status)
    ? record.status
    : null;
  const creationToken = typeof record.creation_token === 'string' ? record.creation_token : '';
  const itemCount = typeof record.item_count === 'number' ? record.item_count : Number(record.item_count);
  const outcome = record.outcome === 'created' || record.outcome === 'reused' ? record.outcome : null;
  if (!haulId || !personId || !sourceListId || !shoppingDate || !status || !creationToken || !outcome) {
    throw new Error('Grocery haul create returned an incomplete result.');
  }
  if (!Number.isFinite(itemCount) || itemCount < 0) {
    throw new Error('Grocery haul create returned an incomplete result.');
  }
  return {
    haul_id: haulId,
    person_id: personId,
    source_grocery_list_id: sourceListId,
    shopping_date: shoppingDate,
    status,
    creation_token: creationToken,
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

export async function getGroceryHaulDetail(
  personId: string,
  haulId: string,
): Promise<{ haul: GroceryHaul; items: GroceryHaulItem[] }> {
  const { data: haul, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('*')
    .eq('id', haulId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grocery haul: ${error.message}`);
  if (!haul) throw new GroceryHaulNotFoundError('Grocery haul not found.');

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('grocery_haul_items')
    .select('*')
    .eq('haul_id', haulId)
    .eq('person_id', personId)
    .order('created_at', { ascending: true });
  if (itemsErr) throw new Error(`Failed to load grocery haul items: ${itemsErr.message}`);

  return {
    haul: haul as unknown as GroceryHaul,
    items: (items ?? []) as unknown as GroceryHaulItem[],
  };
}
