/**
 * Packet 11A/11C/11B — Canonical Haul schema and atomic create RPC contract.
 *
 * Packet 11A: table/index/RLS vocabulary only.
 * Packet 11C: SQL RPC path constants.
 * Packet 11B: app/API/UI calls the live RPC; this file stays SQL-contract only.
 * Distinct from FullHaulEstimate / GroceryHaulSummary (estimate read models).
 */

import type {
  GroceryHaulCreateOutcome,
  GroceryHaulStatus,
  GroceryItemSourceType,
  GroceryItemStatus,
} from '@/lib/plans/types';

export const GROCERY_HAUL_SQL_PATH = 'scripts/sql/createGroceryHaulFoundation.sql';
export const GROCERY_HAUL_ROLLBACK_SQL_PATH = 'scripts/sql/rollbackGroceryHaulFoundation.sql';

export const GROCERY_HAUL_CREATE_RPC_NAME = 'create_grocery_haul_from_list';
export const GROCERY_HAUL_CREATE_RPC_SQL_PATH = 'scripts/sql/addCreateGroceryHaulFromList.sql';
export const GROCERY_HAUL_CREATE_RPC_ROLLBACK_SQL_PATH =
  'scripts/sql/rollbackCreateGroceryHaulFromList.sql';
export const GROCERY_HAUL_CREATE_RPC_VERIFY_SQL_PATH =
  'scripts/sql/verifyCreateGroceryHaulFromList.sql';

export const GROCERY_HAUL_STATUSES = [
  'planned',
  'active',
  'closed',
  'cancelled',
] as const satisfies readonly GroceryHaulStatus[];

export const GROCERY_HAUL_OPEN_STATUSES = ['planned', 'active'] as const satisfies readonly GroceryHaulStatus[];

export type GroceryHaulOpenStatus = (typeof GROCERY_HAUL_OPEN_STATUSES)[number];

export const GROCERY_HAUL_ITEM_SOURCE_STATUSES = [
  'pending',
  'have',
  'bought',
  'skipped',
] as const satisfies readonly GroceryItemStatus[];

export const GROCERY_HAUL_SOURCE_TYPES = [
  'manual',
  'planned_meal',
  'food_recommendation',
  'pantry_restocks',
  'recipe',
  'system',
] as const satisfies readonly GroceryItemSourceType[];

export function isGroceryHaulStatus(value: string): value is GroceryHaulStatus {
  return (GROCERY_HAUL_STATUSES as readonly string[]).includes(value);
}

export function isOpenGroceryHaulStatus(status: GroceryHaulStatus): boolean {
  return (GROCERY_HAUL_OPEN_STATUSES as readonly string[]).includes(status);
}

export const GROCERY_HAUL_CREATION_TOKEN_UNIQUE = 'idx_grocery_hauls_person_creation_token';
export const GROCERY_HAUL_OPEN_LIST_DATE_UNIQUE = 'idx_grocery_hauls_open_list_date';

export const GROCERY_HAUL_CREATE_OUTCOMES = [
  'created',
  'reused',
] as const satisfies readonly GroceryHaulCreateOutcome[];

export const GROCERY_HAUL_CREATE_RPC_ERRORS = [
  'HAUL_CREATE_INVALID_ARGS',
  'HAUL_CREATE_FORBIDDEN',
  'HAUL_CREATE_LIST_NOT_FOUND',
  'HAUL_CREATE_NO_PENDING_ITEMS',
  'HAUL_CREATE_OPEN_EXISTS',
  'HAUL_CREATE_TOKEN_MISMATCH',
  'HAUL_CREATE_TOKEN_RACE',
] as const;

export type GroceryHaulCreateRpcError = (typeof GROCERY_HAUL_CREATE_RPC_ERRORS)[number];

/**
 * Source grocery_item_id is a historical pointer. Schema SET NULL on item
 * hard-delete so frozen snapshots survive. The create RPC revalidates that
 * each snapshotted grocery_item_id belongs to the Haul person and source
 * list; composite live-item FKs are intentionally not used.
 */
export const GROCERY_HAUL_SOURCE_ITEM_ON_DELETE = 'SET NULL' as const;

export const GROCERY_HAUL_SHOPPING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const GROCERY_HAUL_CREATION_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isGroceryHaulShoppingDate(value: string): boolean {
  if (!GROCERY_HAUL_SHOPPING_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isGroceryHaulCreationToken(value: string): boolean {
  return GROCERY_HAUL_CREATION_TOKEN_PATTERN.test(value);
}
