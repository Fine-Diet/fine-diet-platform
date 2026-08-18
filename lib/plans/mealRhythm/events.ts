/**
 * Meal Rhythm audit events — same people_events `other` path as Packet 1.
 * Structured identifiers only.
 */

import {
  MEAL_RHYTHM_ASSUMPTION_POLICY_ID,
  MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION,
  schedulesDiffer,
  type MealRhythmProposalSource,
} from './assumptionPolicy';
import type { MealSchedule } from '@/lib/plans/types';

export const MEAL_RHYTHM_EVENT_SOURCE = 'meal-rhythm';

export type MealRhythmEventName =
  | 'meal_rhythm_proposal_shown'
  | 'meal_rhythm_edit_started'
  | 'meal_rhythm_accepted'
  | 'meal_rhythm_edited'
  | 'meal_rhythm_abandoned'
  | 'meal_rhythm_saved';

export interface MealRhythmDecisionEvent {
  event: MealRhythmEventName;
  policyId: typeof MEAL_RHYTHM_ASSUMPTION_POLICY_ID;
  policyVersion: typeof MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION;
  proposalSource: MealRhythmProposalSource;
  path: 'primary' | 'secondary' | 'exposed' | 'cancel';
  reasonCodes: string[];
  enabledSlotCount: number;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'meal_rhythm_proposal_shown',
  'meal_rhythm_edit_started',
  'meal_rhythm_accepted',
  'meal_rhythm_edited',
  'meal_rhythm_abandoned',
  'meal_rhythm_saved',
]);

const SOURCES: ReadonlySet<string> = new Set([
  'saved_schedule',
  'onboarding',
  'product_default',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'secondary', 'exposed', 'cancel']);

export function parseMealRhythmDecisionEvent(body: unknown): MealRhythmDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== MEAL_RHYTHM_ASSUMPTION_POLICY_ID) return null;
  if (record.policyVersion !== MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION) return null;
  if (typeof record.proposalSource !== 'string' || !SOURCES.has(record.proposalSource)) {
    return null;
  }
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.enabledSlotCount !== 'number' || record.enabledSlotCount < 0) return null;
  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  return {
    event: record.event as MealRhythmEventName,
    policyId: MEAL_RHYTHM_ASSUMPTION_POLICY_ID,
    policyVersion: MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION,
    proposalSource: record.proposalSource as MealRhythmProposalSource,
    path: record.path as MealRhythmDecisionEvent['path'],
    reasonCodes,
    enabledSlotCount: Math.floor(record.enabledSlotCount),
  };
}

/**
 * `meal_rhythm_edited` is reserved for actual schedule-value changes from the
 * proposed/saved baseline. Entering edit mode is `meal_rhythm_edit_started`.
 */
export function classifyMealRhythmSaveEvent(
  baseline: MealSchedule,
  next: MealSchedule,
): 'meal_rhythm_accepted' | 'meal_rhythm_edited' {
  return schedulesDiffer(baseline, next) ? 'meal_rhythm_edited' : 'meal_rhythm_accepted';
}

export function toMealRhythmEventMetadata(
  event: MealRhythmDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    proposal_source: event.proposalSource,
    path: event.path,
    reason_codes: event.reasonCodes,
    enabled_slot_count: event.enabledSlotCount,
  };
}
