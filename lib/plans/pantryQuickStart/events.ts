/**
 * Pantry Quick Start audit events — people_events `other`, no DDL.
 * Structured identifiers/reason codes only. Never persist food free text.
 */

import {
  PANTRY_QUICK_START_POLICY_ID,
  PANTRY_QUICK_START_POLICY_VERSION,
} from './catalog';
import type { PantryQuickStartProposalSource } from './proposalPolicy';

export const PANTRY_QUICK_START_EVENT_SOURCE = 'pantry-quick-start';

export type PantryQuickStartEventName =
  | 'pantry_quick_start_proposal_shown'
  | 'pantry_quick_start_item_toggled'
  | 'pantry_quick_start_category_skipped'
  | 'pantry_quick_start_saved'
  | 'pantry_quick_start_abandoned';

export interface PantryQuickStartDecisionEvent {
  event: PantryQuickStartEventName;
  policyId: typeof PANTRY_QUICK_START_POLICY_ID;
  policyVersion: typeof PANTRY_QUICK_START_POLICY_VERSION;
  proposalSource: PantryQuickStartProposalSource;
  path: 'primary' | 'secondary' | 'exposed' | 'cancel';
  reasonCodes: string[];
  acceptedCount: number;
  skippedCategoryCount: number;
  alreadySavedCount: number;
  stapleId: string | null;
  categoryId: string | null;
}

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'pantry_quick_start_proposal_shown',
  'pantry_quick_start_item_toggled',
  'pantry_quick_start_category_skipped',
  'pantry_quick_start_saved',
  'pantry_quick_start_abandoned',
]);

const SOURCES: ReadonlySet<string> = new Set(['saved_pantry', 'product_default']);
const PATHS: ReadonlySet<string> = new Set(['primary', 'secondary', 'exposed', 'cancel']);

export function parsePantryQuickStartDecisionEvent(
  body: unknown,
): PantryQuickStartDecisionEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.event !== 'string' || !EVENT_NAMES.has(record.event)) return null;
  if (record.policyId !== PANTRY_QUICK_START_POLICY_ID) return null;
  if (record.policyVersion !== PANTRY_QUICK_START_POLICY_VERSION) return null;
  if (typeof record.proposalSource !== 'string' || !SOURCES.has(record.proposalSource)) {
    return null;
  }
  if (typeof record.path !== 'string' || !PATHS.has(record.path)) return null;
  if (typeof record.acceptedCount !== 'number' || record.acceptedCount < 0) return null;
  if (typeof record.skippedCategoryCount !== 'number' || record.skippedCategoryCount < 0) {
    return null;
  }
  if (typeof record.alreadySavedCount !== 'number' || record.alreadySavedCount < 0) return null;

  let stapleId: string | null = null;
  if (record.stapleId === null || record.stapleId === undefined) {
    stapleId = null;
  } else if (typeof record.stapleId === 'string' && record.stapleId.length > 0) {
    stapleId = record.stapleId;
  } else {
    return null;
  }

  let categoryId: string | null = null;
  if (record.categoryId === null || record.categoryId === undefined) {
    categoryId = null;
  } else if (typeof record.categoryId === 'string' && record.categoryId.length > 0) {
    categoryId = record.categoryId;
  } else {
    return null;
  }

  const reasonCodes = Array.isArray(record.reasonCodes)
    ? record.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];

  return {
    event: record.event as PantryQuickStartEventName,
    policyId: PANTRY_QUICK_START_POLICY_ID,
    policyVersion: PANTRY_QUICK_START_POLICY_VERSION,
    proposalSource: record.proposalSource as PantryQuickStartProposalSource,
    path: record.path as PantryQuickStartDecisionEvent['path'],
    reasonCodes,
    acceptedCount: Math.floor(record.acceptedCount),
    skippedCategoryCount: Math.floor(record.skippedCategoryCount),
    alreadySavedCount: Math.floor(record.alreadySavedCount),
    stapleId,
    categoryId,
  };
}

export function toPantryQuickStartEventMetadata(
  event: PantryQuickStartDecisionEvent,
): Record<string, unknown> {
  return {
    decision_event: event.event,
    policy_id: event.policyId,
    policy_version: event.policyVersion,
    proposal_source: event.proposalSource,
    path: event.path,
    reason_codes: event.reasonCodes,
    accepted_count: event.acceptedCount,
    skipped_category_count: event.skippedCategoryCount,
    already_saved_count: event.alreadySavedCount,
    staple_id: event.stapleId,
    category_id: event.categoryId,
  };
}
