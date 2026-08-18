/**
 * Packet 11B Grocery Haul create/view audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist grocery item free text.
 */

import type { GroceryHaulCreateOutcome } from '@/lib/plans/types';
import type { GroceryListReadinessState } from '@/lib/plans/groceryListReadiness/policy';
import type { GroceryHaulCreateBlockReason } from './eligibility';

export const GROCERY_HAUL_CREATE_POLICY_ID = 'grocery-haul-create.v1' as const;
export const GROCERY_HAUL_CREATE_POLICY_VERSION = 'v1' as const;
export const GROCERY_HAUL_EVENT_SOURCE = 'grocery-haul-create';

export type GroceryHaulEventName =
  | 'grocery_haul_start_opened'
  | 'grocery_haul_create_committed'
  | 'grocery_haul_create_reused'
  | 'grocery_haul_create_blocked'
  | 'grocery_haul_viewed';

export type GroceryHaulEventOutcome = GroceryHaulCreateOutcome | 'blocked' | 'none';

export interface GroceryHaulDecisionEvent {
  event: GroceryHaulEventName;
  policyId: typeof GROCERY_HAUL_CREATE_POLICY_ID;
  policyVersion: typeof GROCERY_HAUL_CREATE_POLICY_VERSION;
  path: 'primary' | 'secondary' | 'cancel';
  reasonCodes: string[];
  listId: string | null;
  haulId: string | null;
  shoppingDate: string | null;
  readinessState: GroceryListReadinessState | 'unknown';
  pendingCount: number;
  outcome: GroceryHaulEventOutcome;
  blockReason: GroceryHaulCreateBlockReason | 'no_pending' | 'token_mismatch' | 'forbidden' | null;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'grocery_haul_start_opened',
  'grocery_haul_create_committed',
  'grocery_haul_create_reused',
  'grocery_haul_create_blocked',
  'grocery_haul_viewed',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'secondary', 'cancel']);
const STATES: ReadonlySet<string> = new Set([
  'empty_or_no_demand',
  'needs_resolution',
  'ready_to_shop',
  'shopping_in_progress',
  'complete_or_closed',
  'unknown',
]);
const OUTCOMES: ReadonlySet<string> = new Set(['created', 'reused', 'blocked', 'none']);
const BLOCK_REASONS: ReadonlySet<string> = new Set([
  'archived',
  'empty_or_no_demand',
  'needs_resolution',
  'complete_or_closed',
  'no_pending',
  'token_mismatch',
  'forbidden',
]);

export function parseGroceryHaulDecisionEvent(body: unknown): GroceryHaulDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== GROCERY_HAUL_CREATE_POLICY_ID) return null;
  if (record.policyVersion !== GROCERY_HAUL_CREATE_POLICY_VERSION) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (record.listId !== null && typeof record.listId !== 'string') return null;
  if (record.haulId !== null && typeof record.haulId !== 'string') return null;
  if (record.shoppingDate !== null && typeof record.shoppingDate !== 'string') return null;
  if (typeof record.readinessState !== 'string' || !STATES.has(record.readinessState)) return null;
  if (typeof record.pendingCount !== 'number' || record.pendingCount < 0) return null;
  if (typeof record.outcome !== 'string' || !OUTCOMES.has(record.outcome)) return null;
  if (record.blockReason !== null && (typeof record.blockReason !== 'string' || !BLOCK_REASONS.has(record.blockReason))) {
    return null;
  }
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as GroceryHaulEventName,
    policyId: GROCERY_HAUL_CREATE_POLICY_ID,
    policyVersion: GROCERY_HAUL_CREATE_POLICY_VERSION,
    path: record.path as GroceryHaulDecisionEvent['path'],
    reasonCodes,
    listId: typeof record.listId === 'string' ? record.listId : null,
    haulId: typeof record.haulId === 'string' ? record.haulId : null,
    shoppingDate: typeof record.shoppingDate === 'string' ? record.shoppingDate : null,
    readinessState: record.readinessState as GroceryHaulDecisionEvent['readinessState'],
    pendingCount: Math.floor(record.pendingCount),
    outcome: record.outcome as GroceryHaulEventOutcome,
    blockReason: typeof record.blockReason === 'string'
      ? (record.blockReason as GroceryHaulDecisionEvent['blockReason'])
      : null,
  };
}

export function toGroceryHaulEventMetadata(
  event: GroceryHaulDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    list_id: event.listId,
    haul_id: event.haulId,
    shopping_date: event.shoppingDate,
    readiness_state: event.readinessState,
    pending_count: event.pendingCount,
    outcome: event.outcome,
    block_reason: event.blockReason,
  };
}
