/**
 * Canonical Packet 8 client write. Session identity is applied by
 * POST /api/journal/plans/meals/repeat. This helper never includes a
 * person identifier and never writes the client DB.
 */

import type { MealSlotKey } from '@/lib/plans/types';
import {
  PLAN_REPEAT_POLICY_ID,
  PLAN_REPEAT_POLICY_VERSION,
  formatRepeatResultCopy,
  type PlanRepeatRequestReasonCode,
  type RepeatSelectedOpenResult,
} from './policy';
import { emitPlanRepeatEvent } from './emitEvent';

export const PLAN_REPEAT_PATH = '/api/journal/plans/meals/repeat';

const SAFE_ERROR = 'Could not repeat that meal. Try again.';

export async function repeatSelectedOpenOccasions(args: {
  planId: string;
  sourcePlannedMealId: string;
  sourceMealDocumentId: string | null;
  destinations: Array<{ dateLocal: string; slotKey: MealSlotKey }>;
}): Promise<
  | { ok: true; result: RepeatSelectedOpenResult; summary: string }
  | { ok: false; error: string; reasonCode: PlanRepeatRequestReasonCode }
> {
  try {
    const res = await fetch(PLAN_REPEAT_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: args.planId,
        sourcePlannedMealId: args.sourcePlannedMealId,
        destinations: args.destinations,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      reasonCode?: unknown;
      planId?: unknown;
      sourcePlannedMealId?: unknown;
      sourceMealDocumentId?: unknown;
      destinations?: unknown;
      attachedCount?: unknown;
      reusedCount?: unknown;
      occupiedSkippedCount?: unknown;
      invalidCount?: unknown;
      failedCount?: unknown;
      partial?: unknown;
    };

    if (!res.ok) {
      const reasonCode = parseRequestReasonCode(json.reasonCode);
      return {
        ok: false,
        error: typeof json.error === 'string' && json.error.trim() ? json.error : SAFE_ERROR,
        reasonCode,
      };
    }

    const result = parseRepeatResult(json);
    if (!result) {
      return { ok: false, error: SAFE_ERROR, reasonCode: 'repeat_write_failed' };
    }

    emitPlanRepeatEvent({
      event: result.partial ? 'plan_repeat_partial' : 'plan_repeat_committed',
      policyId: PLAN_REPEAT_POLICY_ID,
      policyVersion: PLAN_REPEAT_POLICY_VERSION,
      path: 'primary',
      reasonCodes: [
        result.partial ? 'repeat_partial_success' : 'repeat_committed',
        `attached:${result.attachedCount}`,
        `reused:${result.reusedCount}`,
        `occupied_skipped:${result.occupiedSkippedCount}`,
      ],
      planId: result.planId,
      sourcePlannedMealId: result.sourcePlannedMealId,
      sourceMealDocumentId: result.sourceMealDocumentId,
      dateLocal: null,
      slotKey: null,
      selected: false,
      destinationCount: result.destinations.length,
      attachedCount: result.attachedCount,
      reusedCount: result.reusedCount,
      occupiedSkippedCount: result.occupiedSkippedCount,
      invalidCount: result.invalidCount,
      failedCount: result.failedCount,
      partial: result.partial,
    });

    return { ok: true, result, summary: formatRepeatResultCopy(result) };
  } catch {
    return { ok: false, error: SAFE_ERROR, reasonCode: 'repeat_write_failed' };
  }
}

function parseRequestReasonCode(value: unknown): PlanRepeatRequestReasonCode {
  return value === 'no_active_plan' ||
    value === 'not_canonical_active_plan' ||
    value === 'plan_not_found' ||
    value === 'source_not_found' ||
    value === 'source_not_on_plan' ||
    value === 'source_not_canonical' ||
    value === 'missing_usable_meal_rhythm' ||
    value === 'invalid_request'
    ? value
    : 'repeat_write_failed';
}

function parseRepeatResult(json: {
  planId?: unknown;
  sourcePlannedMealId?: unknown;
  sourceMealDocumentId?: unknown;
  destinations?: unknown;
  attachedCount?: unknown;
  reusedCount?: unknown;
  occupiedSkippedCount?: unknown;
  invalidCount?: unknown;
  failedCount?: unknown;
  partial?: unknown;
}): RepeatSelectedOpenResult | null {
  if (
    typeof json.planId !== 'string' ||
    typeof json.sourcePlannedMealId !== 'string' ||
    typeof json.sourceMealDocumentId !== 'string' ||
    !Array.isArray(json.destinations) ||
    typeof json.attachedCount !== 'number' ||
    typeof json.reusedCount !== 'number' ||
    typeof json.occupiedSkippedCount !== 'number' ||
    typeof json.invalidCount !== 'number' ||
    typeof json.failedCount !== 'number' ||
    typeof json.partial !== 'boolean'
  ) {
    return null;
  }
  return json as RepeatSelectedOpenResult;
}
