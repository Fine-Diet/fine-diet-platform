/**
 * Simplified Plan Today audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist meal free text.
 */

import { PLAN_TODAY_POLICY_ID, PLAN_TODAY_POLICY_VERSION } from './policy';

export const PLAN_TODAY_EVENT_SOURCE = 'plan-today';

export type PlanTodayEventName =
  | 'plan_today_shown'
  | 'plan_today_next_started'
  | 'plan_today_complete_shown'
  | 'plan_today_abandoned';

export interface PlanTodayDecisionEvent {
  event: PlanTodayEventName;
  policyId: typeof PLAN_TODAY_POLICY_ID;
  policyVersion: typeof PLAN_TODAY_POLICY_VERSION;
  path: 'primary' | 'secondary' | 'exposed' | 'cancel';
  reasonCodes: string[];
  openCount: number;
  plannedCount: number;
  slotKey: string | null;
  canAttach: boolean;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'plan_today_shown',
  'plan_today_next_started',
  'plan_today_complete_shown',
  'plan_today_abandoned',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'secondary', 'exposed', 'cancel']);

export function parsePlanTodayDecisionEvent(body: unknown): PlanTodayDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== PLAN_TODAY_POLICY_ID) return null;
  if (record.policyVersion !== PLAN_TODAY_POLICY_VERSION) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.openCount !== 'number' || record.openCount < 0) return null;
  if (typeof record.plannedCount !== 'number' || record.plannedCount < 0) return null;
  if (typeof record.canAttach !== 'boolean') return null;
  let slotKey: string | null = null;
  if (record.slotKey === null || record.slotKey === undefined) {
    slotKey = null;
  } else if (typeof record.slotKey === 'string' && record.slotKey.length > 0) {
    slotKey = record.slotKey;
  } else {
    return null;
  }
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as PlanTodayEventName,
    policyId: PLAN_TODAY_POLICY_ID,
    policyVersion: PLAN_TODAY_POLICY_VERSION,
    path: record.path as PlanTodayDecisionEvent['path'],
    reasonCodes,
    openCount: Math.floor(record.openCount),
    plannedCount: Math.floor(record.plannedCount),
    slotKey,
    canAttach: record.canAttach,
  };
}

export function toPlanTodayEventMetadata(
  event: PlanTodayDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    open_count: event.openCount,
    planned_count: event.plannedCount,
    slot_key: event.slotKey,
    can_attach: event.canAttach,
  };
}
