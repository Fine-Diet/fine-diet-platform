/**
 * Packet 10 Grocery/List readiness audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist grocery item free text.
 */

import {
  GROCERY_LIST_READINESS_POLICY_ID,
  GROCERY_LIST_READINESS_POLICY_VERSION,
  type GroceryListReadinessState,
} from './policy';

export const GROCERY_LIST_READINESS_EVENT_SOURCE = 'grocery-list-readiness';

export type GroceryListReadinessEventName =
  | 'grocery_list_readiness_viewed'
  | 'grocery_list_state_changed'
  | 'grocery_list_resolution_needed'
  | 'grocery_list_ready_to_shop'
  | 'grocery_list_pricing_opened'
  | 'grocery_list_retailer_previewed'
  | 'grocery_list_pull_from_plan_started'
  | 'grocery_list_pull_from_plan_committed';

export interface GroceryListReadinessDecisionEvent {
  event: GroceryListReadinessEventName;
  policyId: typeof GROCERY_LIST_READINESS_POLICY_ID;
  policyVersion: typeof GROCERY_LIST_READINESS_POLICY_VERSION;
  path: 'primary' | 'secondary' | 'cancel';
  reasonCodes: string[];
  listId: string;
  planId: string | null;
  readinessState: GroceryListReadinessState | 'unknown';
  pendingCount: number;
  pricedItemCount: number;
  unresolvedCount: number;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'grocery_list_readiness_viewed',
  'grocery_list_state_changed',
  'grocery_list_resolution_needed',
  'grocery_list_ready_to_shop',
  'grocery_list_pricing_opened',
  'grocery_list_retailer_previewed',
  'grocery_list_pull_from_plan_started',
  'grocery_list_pull_from_plan_committed',
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

export function parseGroceryListReadinessDecisionEvent(
  body: unknown,
): GroceryListReadinessDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== GROCERY_LIST_READINESS_POLICY_ID) return null;
  if (record.policyVersion !== GROCERY_LIST_READINESS_POLICY_VERSION) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.listId !== 'string' || record.listId.length === 0) return null;
  if (record.planId !== null && typeof record.planId !== 'string') return null;
  if (typeof record.readinessState !== 'string' || !STATES.has(record.readinessState)) return null;
  if (typeof record.pendingCount !== 'number' || record.pendingCount < 0) return null;
  if (typeof record.pricedItemCount !== 'number' || record.pricedItemCount < 0) return null;
  if (typeof record.unresolvedCount !== 'number' || record.unresolvedCount < 0) return null;
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as GroceryListReadinessEventName,
    policyId: GROCERY_LIST_READINESS_POLICY_ID,
    policyVersion: GROCERY_LIST_READINESS_POLICY_VERSION,
    path: record.path as GroceryListReadinessDecisionEvent['path'],
    reasonCodes,
    listId: record.listId,
    planId: typeof record.planId === 'string' ? record.planId : null,
    readinessState: record.readinessState as GroceryListReadinessDecisionEvent['readinessState'],
    pendingCount: Math.floor(record.pendingCount),
    pricedItemCount: Math.floor(record.pricedItemCount),
    unresolvedCount: Math.floor(record.unresolvedCount),
  };
}

export function toGroceryListReadinessEventMetadata(
  event: GroceryListReadinessDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    list_id: event.listId,
    plan_id: event.planId,
    readiness_state: event.readinessState,
    pending_count: event.pendingCount,
    priced_item_count: event.pricedItemCount,
    unresolved_count: event.unresolvedCount,
  };
}
