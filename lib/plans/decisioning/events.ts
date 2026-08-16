/**
 * Plans next-best-action event contract.
 *
 * Stored on existing people_events using event_type `other` so Packet 1
 * does not require a CHECK-constraint DDL. Dedicated event_type values are
 * a documented follow-up.
 *
 * Privacy: structured identifiers only — never meal/health free text.
 */

import {
  PLANS_NBA_RESOLVER_VERSION,
  type DecisionActionId,
  type DecisionConfidence,
  type DecisionEventName,
  type PlansDecisionEvent,
  type PlansNbaStateKey,
} from './types';

export const PEOPLE_EVENTS_COMPAT_TYPE = 'other' as const;
export const DECISION_EVENT_SOURCE = 'plans-nba';
export const DECISION_EVENT_CHANNEL = 'app';

const STATE_KEYS: ReadonlySet<string> = new Set([
  'loading',
  'error',
  'setup_meal_rhythm',
  'setup_pantry',
  'plan_today',
  'finish_today',
  'plan_ahead',
  'review_plan',
]);

const ACTION_IDS: ReadonlySet<string> = new Set([
  'setup_meal_rhythm',
  'setup_pantry',
  'plan_without_pantry',
  'plan_today',
  'finish_today',
  'plan_ahead',
  'review_plan',
  'open_grocery',
]);

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'plans_nba_exposed',
  'plans_nba_action_taken',
]);

const PATHS: ReadonlySet<string> = new Set(['primary', 'secondary', 'exposed']);

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, 12);
}

export function parsePlansDecisionEvent(body: unknown): PlansDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;

  if (record.resolverVersion !== PLANS_NBA_RESOLVER_VERSION) return null;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (typeof record.stateKey !== 'string' || !STATE_KEYS.has(record.stateKey)) return null;
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (
    record.confidence !== 'deterministic' &&
    record.confidence !== 'inferred' &&
    record.confidence !== 'unknown'
  ) {
    return null;
  }

  const primaryActionId =
    record.primaryActionId === null || record.primaryActionId === undefined
      ? null
      : typeof record.primaryActionId === 'string' && ACTION_IDS.has(record.primaryActionId)
        ? (record.primaryActionId as DecisionActionId)
        : null;

  if (
    record.primaryActionId !== null &&
    record.primaryActionId !== undefined &&
    primaryActionId === null
  ) {
    return null;
  }

  let takenActionId: DecisionActionId | null | undefined;
  if (record.takenActionId === undefined) {
    takenActionId = undefined;
  } else if (record.takenActionId === null) {
    takenActionId = null;
  } else if (typeof record.takenActionId === 'string' && ACTION_IDS.has(record.takenActionId)) {
    takenActionId = record.takenActionId as DecisionActionId;
  } else {
    return null;
  }

  return {
    event: record.event as DecisionEventName,
    resolverVersion: PLANS_NBA_RESOLVER_VERSION,
    stateKey: record.stateKey as PlansNbaStateKey,
    primaryActionId,
    takenActionId,
    path: record.path as PlansDecisionEvent['path'],
    reasonCodes: asStringArray(record.reasonCodes),
    confidence: record.confidence as DecisionConfidence,
  };
}

export function toPeopleEventMetadata(event: PlansDecisionEvent): Record<string, unknown> {
  return {
    decision_event: event.event,
    resolver_version: event.resolverVersion,
    state_key: event.stateKey,
    primary_action_id: event.primaryActionId,
    taken_action_id: event.takenActionId ?? null,
    path: event.path,
    reason_codes: event.reasonCodes,
    confidence: event.confidence,
  };
}
