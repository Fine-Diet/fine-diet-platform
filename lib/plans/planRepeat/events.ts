/**
 * Packet 8 repeat-selected-open audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist meal free text.
 */

import {
  PLAN_REPEAT_POLICY_ID,
  PLAN_REPEAT_POLICY_VERSION,
} from './policy';

export const PLAN_REPEAT_EVENT_SOURCE = 'plan-repeat';

export type PlanRepeatEventName =
  | 'plan_repeat_started'
  | 'plan_repeat_destination_toggled'
  | 'plan_repeat_committed'
  | 'plan_repeat_partial'
  | 'plan_repeat_abandoned';

export interface PlanRepeatDecisionEvent {
  event: PlanRepeatEventName;
  policyId: typeof PLAN_REPEAT_POLICY_ID;
  policyVersion: typeof PLAN_REPEAT_POLICY_VERSION;
  path: 'primary' | 'cancel';
  reasonCodes: string[];
  planId: string;
  sourcePlannedMealId: string;
  sourceMealDocumentId: string | null;
  dateLocal: string | null;
  slotKey: string | null;
  selected: boolean;
  destinationCount: number;
  attachedCount: number;
  reusedCount: number;
  occupiedSkippedCount: number;
  invalidCount: number;
  failedCount: number;
  partial: boolean;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'plan_repeat_started',
  'plan_repeat_destination_toggled',
  'plan_repeat_committed',
  'plan_repeat_partial',
  'plan_repeat_abandoned',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'cancel']);

export function parsePlanRepeatDecisionEvent(
  body: unknown,
): PlanRepeatDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== PLAN_REPEAT_POLICY_ID) return null;
  if (record.policyVersion !== PLAN_REPEAT_POLICY_VERSION) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.planId !== 'string' || record.planId.length === 0) return null;
  if (typeof record.sourcePlannedMealId !== 'string' || record.sourcePlannedMealId.length === 0) {
    return null;
  }
  if (record.sourceMealDocumentId !== null && typeof record.sourceMealDocumentId !== 'string') {
    return null;
  }
  if (record.dateLocal !== null && typeof record.dateLocal !== 'string') return null;
  if (record.slotKey !== null && typeof record.slotKey !== 'string') return null;
  if (typeof record.selected !== 'boolean') return null;
  if (typeof record.destinationCount !== 'number' || record.destinationCount < 0) return null;
  if (typeof record.attachedCount !== 'number' || record.attachedCount < 0) return null;
  if (typeof record.reusedCount !== 'number' || record.reusedCount < 0) return null;
  if (typeof record.occupiedSkippedCount !== 'number' || record.occupiedSkippedCount < 0) {
    return null;
  }
  if (typeof record.invalidCount !== 'number' || record.invalidCount < 0) return null;
  if (typeof record.failedCount !== 'number' || record.failedCount < 0) return null;
  if (typeof record.partial !== 'boolean') return null;
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as PlanRepeatEventName,
    policyId: PLAN_REPEAT_POLICY_ID,
    policyVersion: PLAN_REPEAT_POLICY_VERSION,
    path: record.path as PlanRepeatDecisionEvent['path'],
    reasonCodes,
    planId: record.planId,
    sourcePlannedMealId: record.sourcePlannedMealId,
    sourceMealDocumentId:
      typeof record.sourceMealDocumentId === 'string' ? record.sourceMealDocumentId : null,
    dateLocal: typeof record.dateLocal === 'string' ? record.dateLocal : null,
    slotKey: typeof record.slotKey === 'string' ? record.slotKey : null,
    selected: record.selected,
    destinationCount: Math.floor(record.destinationCount),
    attachedCount: Math.floor(record.attachedCount),
    reusedCount: Math.floor(record.reusedCount),
    occupiedSkippedCount: Math.floor(record.occupiedSkippedCount),
    invalidCount: Math.floor(record.invalidCount),
    failedCount: Math.floor(record.failedCount),
    partial: record.partial,
  };
}

export function toPlanRepeatEventMetadata(
  event: PlanRepeatDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    plan_id: event.planId,
    source_planned_meal_id: event.sourcePlannedMealId,
    source_meal_document_id: event.sourceMealDocumentId,
    date_local: event.dateLocal,
    slot_key: event.slotKey,
    selected: event.selected,
    destination_count: event.destinationCount,
    attached_count: event.attachedCount,
    reused_count: event.reusedCount,
    occupied_skipped_count: event.occupiedSkippedCount,
    invalid_count: event.invalidCount,
    failed_count: event.failedCount,
    partial: event.partial,
  };
}
