/**
 * Packet 9 Plan-to-Grocery handoff audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist meal free text.
 */

import {
  PLAN_GROCERY_HANDOFF_POLICY_ID,
  PLAN_GROCERY_HANDOFF_POLICY_VERSION,
  type PlanGroceryGenerateOutcome,
} from './policy';

export const PLAN_GROCERY_HANDOFF_EVENT_SOURCE = 'plan-grocery-handoff';

export type PlanGroceryHandoffEventName =
  | 'plan_grocery_handoff_started'
  | 'plan_grocery_range_changed'
  | 'plan_grocery_generate_committed'
  | 'plan_grocery_existing_reused'
  | 'plan_grocery_no_planned_demand'
  | 'plan_grocery_generation_failed'
  | 'plan_grocery_handoff_abandoned';

export interface PlanGroceryHandoffDecisionEvent {
  event: PlanGroceryHandoffEventName;
  policyId: typeof PLAN_GROCERY_HANDOFF_POLICY_ID;
  policyVersion: typeof PLAN_GROCERY_HANDOFF_POLICY_VERSION;
  path: 'primary' | 'cancel';
  reasonCodes: string[];
  planId: string;
  dateStart: string | null;
  dateEnd: string | null;
  plannedMealCount: number;
  outcome: PlanGroceryGenerateOutcome | 'none';
  clamped: boolean;
  listId: string | null;
  selectionKind: string | null;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'plan_grocery_handoff_started',
  'plan_grocery_range_changed',
  'plan_grocery_generate_committed',
  'plan_grocery_existing_reused',
  'plan_grocery_no_planned_demand',
  'plan_grocery_generation_failed',
  'plan_grocery_handoff_abandoned',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'cancel']);
const OUTCOMES: ReadonlySet<string> = new Set(['reused', 'generated', 'none']);

export function parsePlanGroceryHandoffDecisionEvent(
  body: unknown,
): PlanGroceryHandoffDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== PLAN_GROCERY_HANDOFF_POLICY_ID) return null;
  if (record.policyVersion !== PLAN_GROCERY_HANDOFF_POLICY_VERSION) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.planId !== 'string' || record.planId.length === 0) return null;
  if (record.dateStart !== null && typeof record.dateStart !== 'string') return null;
  if (record.dateEnd !== null && typeof record.dateEnd !== 'string') return null;
  if (typeof record.plannedMealCount !== 'number' || record.plannedMealCount < 0) return null;
  if (typeof record.outcome !== 'string' || !OUTCOMES.has(record.outcome)) return null;
  if (typeof record.clamped !== 'boolean') return null;
  if (record.listId !== null && typeof record.listId !== 'string') return null;
  if (record.selectionKind !== null && typeof record.selectionKind !== 'string') return null;
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as PlanGroceryHandoffEventName,
    policyId: PLAN_GROCERY_HANDOFF_POLICY_ID,
    policyVersion: PLAN_GROCERY_HANDOFF_POLICY_VERSION,
    path: record.path as PlanGroceryHandoffDecisionEvent['path'],
    reasonCodes,
    planId: record.planId,
    dateStart: typeof record.dateStart === 'string' ? record.dateStart : null,
    dateEnd: typeof record.dateEnd === 'string' ? record.dateEnd : null,
    plannedMealCount: Math.floor(record.plannedMealCount),
    outcome: record.outcome as PlanGroceryHandoffDecisionEvent['outcome'],
    clamped: record.clamped,
    listId: typeof record.listId === 'string' ? record.listId : null,
    selectionKind: typeof record.selectionKind === 'string' ? record.selectionKind : null,
  };
}

export function toPlanGroceryHandoffEventMetadata(
  event: PlanGroceryHandoffDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    plan_id: event.planId,
    date_start: event.dateStart,
    date_end: event.dateEnd,
    planned_meal_count: event.plannedMealCount,
    outcome: event.outcome,
    clamped: event.clamped,
    list_id: event.listId,
    selection_kind: event.selectionKind,
  };
}
