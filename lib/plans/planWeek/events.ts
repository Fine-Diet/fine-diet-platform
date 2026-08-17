/**
 * Simplified Plan Week audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist meal free text.
 */

import { PLAN_WEEK_POLICY_ID, PLAN_WEEK_POLICY_VERSION } from './policy';

export const PLAN_WEEK_EVENT_SOURCE = 'plan-week';

export type PlanWeekEventName =
  | 'plan_week_shown'
  | 'plan_week_open_slot_started'
  | 'plan_week_meal_attached'
  | 'plan_week_complete_shown'
  | 'plan_week_abandoned';

export interface PlanWeekDecisionEvent {
  event: PlanWeekEventName;
  policyId: typeof PLAN_WEEK_POLICY_ID;
  policyVersion: typeof PLAN_WEEK_POLICY_VERSION;
  path: 'primary' | 'secondary' | 'exposed' | 'cancel';
  reasonCodes: string[];
  openCount: number;
  plannedCount: number;
  attachableOpenCount: number;
  date: string | null;
  slotKey: string | null;
  canAttach: boolean;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'plan_week_shown',
  'plan_week_open_slot_started',
  'plan_week_meal_attached',
  'plan_week_complete_shown',
  'plan_week_abandoned',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'secondary', 'exposed', 'cancel']);

export function parsePlanWeekDecisionEvent(body: unknown): PlanWeekDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== PLAN_WEEK_POLICY_ID) return null;
  if (record.policyVersion !== PLAN_WEEK_POLICY_VERSION) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.openCount !== 'number' || record.openCount < 0) return null;
  if (typeof record.plannedCount !== 'number' || record.plannedCount < 0) return null;
  if (typeof record.attachableOpenCount !== 'number' || record.attachableOpenCount < 0) {
    return null;
  }
  if (typeof record.canAttach !== 'boolean') return null;

  let date: string | null = null;
  if (record.date === null || record.date === undefined) {
    date = null;
  } else if (typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
    date = record.date;
  } else {
    return null;
  }

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
    event: record.event as PlanWeekEventName,
    policyId: PLAN_WEEK_POLICY_ID,
    policyVersion: PLAN_WEEK_POLICY_VERSION,
    path: record.path as PlanWeekDecisionEvent['path'],
    reasonCodes,
    openCount: Math.floor(record.openCount),
    plannedCount: Math.floor(record.plannedCount),
    attachableOpenCount: Math.floor(record.attachableOpenCount),
    date,
    slotKey,
    canAttach: record.canAttach,
  };
}

export function toPlanWeekEventMetadata(
  event: PlanWeekDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    open_count: event.openCount,
    planned_count: event.plannedCount,
    attachable_open_count: event.attachableOpenCount,
    date: event.date,
    slot_key: event.slotKey,
    can_attach: event.canAttach,
  };
}
