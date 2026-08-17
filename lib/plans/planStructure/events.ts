/**
 * Packet 7 structure-ensure audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist meal free text.
 */

import {
  PLAN_STRUCTURE_POLICY_ID,
  PLAN_STRUCTURE_POLICY_VERSION,
} from './policy';

export const PLAN_STRUCTURE_EVENT_SOURCE = 'plan-structure';

export type PlanStructureEventName =
  | 'plan_structure_ensure_started'
  | 'plan_structure_ensure_succeeded'
  | 'plan_structure_ensure_failed';

export interface PlanStructureDecisionEvent {
  event: PlanStructureEventName;
  policyId: typeof PLAN_STRUCTURE_POLICY_ID;
  policyVersion: typeof PLAN_STRUCTURE_POLICY_VERSION;
  path: 'primary';
  reasonCodes: string[];
  planId: string;
  dateLocal: string;
  slotKey: string;
  createdDay: boolean;
  createdSlot: boolean;
  reused: boolean;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'plan_structure_ensure_started',
  'plan_structure_ensure_succeeded',
  'plan_structure_ensure_failed',
]);

export function parsePlanStructureDecisionEvent(
  body: unknown,
): PlanStructureDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== PLAN_STRUCTURE_POLICY_ID) return null;
  if (record.policyVersion !== PLAN_STRUCTURE_POLICY_VERSION) return null;
  if (record.path !== 'primary') return null;
  if (typeof record.planId !== 'string' || record.planId.length === 0) return null;
  if (typeof record.dateLocal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.dateLocal)) {
    return null;
  }
  if (typeof record.slotKey !== 'string' || record.slotKey.length === 0) return null;
  if (typeof record.createdDay !== 'boolean') return null;
  if (typeof record.createdSlot !== 'boolean') return null;
  if (typeof record.reused !== 'boolean') return null;
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as PlanStructureEventName,
    policyId: PLAN_STRUCTURE_POLICY_ID,
    policyVersion: PLAN_STRUCTURE_POLICY_VERSION,
    path: 'primary',
    reasonCodes,
    planId: record.planId,
    dateLocal: record.dateLocal,
    slotKey: record.slotKey,
    createdDay: record.createdDay,
    createdSlot: record.createdSlot,
    reused: record.reused,
  };
}

export function toPlanStructureEventMetadata(
  event: PlanStructureDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    plan_id: event.planId,
    date_local: event.dateLocal,
    slot_key: event.slotKey,
    created_day: event.createdDay,
    created_slot: event.createdSlot,
    reused: event.reused,
  };
}
