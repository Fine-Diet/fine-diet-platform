/**
 * Simplified Meal Creation audit events — people_events `other`, no DDL.
 * Structured identifiers only. Never persist meal free text.
 */

import {
  MEAL_CREATION_POLICY_ID,
  MEAL_CREATION_POLICY_VERSION,
} from './candidatePolicy';

export const MEAL_CREATION_EVENT_SOURCE = 'meal-creation';

export type MealCreationEventName =
  | 'meal_creation_candidates_shown'
  | 'meal_creation_existing_selected'
  | 'meal_creation_share_started'
  | 'meal_creation_created'
  | 'meal_creation_attached_to_plan'
  | 'meal_creation_abandoned';

export interface MealCreationDecisionEvent {
  event: MealCreationEventName;
  policyId: typeof MEAL_CREATION_POLICY_ID;
  policyVersion: typeof MEAL_CREATION_POLICY_VERSION;
  path: 'primary' | 'secondary' | 'exposed' | 'cancel';
  reasonCodes: string[];
  candidateCount: number;
  slotKey: string;
  selectedSource: 'saved_library' | 'share_new' | null;
  attached: boolean;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'meal_creation_candidates_shown',
  'meal_creation_existing_selected',
  'meal_creation_share_started',
  'meal_creation_created',
  'meal_creation_attached_to_plan',
  'meal_creation_abandoned',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'secondary', 'exposed', 'cancel']);
const SELECTED_SOURCES: ReadonlySet<string> = new Set(['saved_library', 'share_new']);

export function parseMealCreationDecisionEvent(body: unknown): MealCreationDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== MEAL_CREATION_POLICY_ID) return null;
  if (record.policyVersion !== MEAL_CREATION_POLICY_VERSION) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.candidateCount !== 'number' || record.candidateCount < 0) return null;
  if (typeof record.slotKey !== 'string' || record.slotKey.length === 0) return null;
  if (typeof record.attached !== 'boolean') return null;
  let selectedSource: MealCreationDecisionEvent['selectedSource'] = null;
  if (record.selectedSource === null || record.selectedSource === undefined) {
    selectedSource = null;
  } else if (typeof record.selectedSource === 'string' && SELECTED_SOURCES.has(record.selectedSource)) {
    selectedSource = record.selectedSource as 'saved_library' | 'share_new';
  } else {
    return null;
  }
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as MealCreationEventName,
    policyId: MEAL_CREATION_POLICY_ID,
    policyVersion: MEAL_CREATION_POLICY_VERSION,
    path: record.path as MealCreationDecisionEvent['path'],
    reasonCodes,
    candidateCount: Math.floor(record.candidateCount),
    slotKey: record.slotKey,
    selectedSource,
    attached: record.attached,
  };
}

export function toMealCreationEventMetadata(
  event: MealCreationDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    path: event.path,
    reason_codes: event.reasonCodes,
    candidate_count: event.candidateCount,
    slot_key: event.slotKey,
    selected_source: event.selectedSource,
    attached: event.attached,
  };
}
