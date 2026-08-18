/**
 * Canonical Packet 7 client write. Session identity is applied by
 * POST /api/journal/plans/structure/ensure. This helper never includes a
 * person identifier and never writes the client DB.
 */

import type { MealSlotKey } from '@/lib/plans/types';
import {
  PLAN_STRUCTURE_POLICY_ID,
  PLAN_STRUCTURE_POLICY_VERSION,
  type EnsurePlanOccasionStructureResult,
  type PlanStructureEnsureReasonCode,
} from './policy';
import { emitPlanStructureEvent } from './emitEvent';

export const PLAN_STRUCTURE_ENSURE_PATH = '/api/journal/plans/structure/ensure';

const SAFE_ERROR = 'Could not prepare that occasion. Try again.';

export async function ensurePlanOccasionStructure(args: {
  planId: string;
  dateLocal: string;
  slotKey: MealSlotKey;
}): Promise<
  | { ok: true; result: EnsurePlanOccasionStructureResult }
  | { ok: false; error: string; reasonCode: PlanStructureEnsureReasonCode }
> {
  emitPlanStructureEvent({
    event: 'plan_structure_ensure_started',
    policyId: PLAN_STRUCTURE_POLICY_ID,
    policyVersion: PLAN_STRUCTURE_POLICY_VERSION,
    path: 'primary',
    reasonCodes: ['explicit_fill_open_occasion'],
    planId: args.planId,
    dateLocal: args.dateLocal,
    slotKey: args.slotKey,
    createdDay: false,
    createdSlot: false,
    reused: false,
  });

  try {
    const res = await fetch(PLAN_STRUCTURE_ENSURE_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: args.planId,
        dateLocal: args.dateLocal,
        slotKey: args.slotKey,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      reasonCode?: unknown;
      planId?: unknown;
      dateLocal?: unknown;
      planDayId?: unknown;
      planSlotId?: unknown;
      slotKey?: unknown;
      createdDay?: unknown;
      createdSlot?: unknown;
      reused?: unknown;
    };

    if (!res.ok) {
      const reasonCode =
        json.reasonCode === 'no_active_plan' ||
        json.reasonCode === 'not_canonical_active_plan' ||
        json.reasonCode === 'date_outside_plan_coverage' ||
        json.reasonCode === 'missing_usable_meal_rhythm' ||
        json.reasonCode === 'occasion_not_enabled' ||
        json.reasonCode === 'plan_not_found' ||
        json.reasonCode === 'invalid_request'
          ? json.reasonCode
          : 'structure_write_failed';
      emitPlanStructureEvent({
        event: 'plan_structure_ensure_failed',
        policyId: PLAN_STRUCTURE_POLICY_ID,
        policyVersion: PLAN_STRUCTURE_POLICY_VERSION,
        path: 'primary',
        reasonCodes: [reasonCode],
        planId: args.planId,
        dateLocal: args.dateLocal,
        slotKey: args.slotKey,
        createdDay: false,
        createdSlot: false,
        reused: false,
      });
      return {
        ok: false,
        error: typeof json.error === 'string' && json.error.trim() ? json.error : SAFE_ERROR,
        reasonCode,
      };
    }

    if (
      typeof json.planId !== 'string' ||
      typeof json.dateLocal !== 'string' ||
      typeof json.planDayId !== 'string' ||
      typeof json.planSlotId !== 'string' ||
      typeof json.slotKey !== 'string' ||
      typeof json.createdDay !== 'boolean' ||
      typeof json.createdSlot !== 'boolean' ||
      typeof json.reused !== 'boolean'
    ) {
      emitPlanStructureEvent({
        event: 'plan_structure_ensure_failed',
        policyId: PLAN_STRUCTURE_POLICY_ID,
        policyVersion: PLAN_STRUCTURE_POLICY_VERSION,
        path: 'primary',
        reasonCodes: ['structure_write_failed'],
        planId: args.planId,
        dateLocal: args.dateLocal,
        slotKey: args.slotKey,
        createdDay: false,
        createdSlot: false,
        reused: false,
      });
      return { ok: false, error: SAFE_ERROR, reasonCode: 'structure_write_failed' };
    }

    const result: EnsurePlanOccasionStructureResult = {
      planId: json.planId,
      dateLocal: json.dateLocal,
      planDayId: json.planDayId,
      planSlotId: json.planSlotId,
      slotKey: args.slotKey,
      createdDay: json.createdDay,
      createdSlot: json.createdSlot,
      reused: json.reused,
    };
    emitPlanStructureEvent({
      event: 'plan_structure_ensure_succeeded',
      policyId: PLAN_STRUCTURE_POLICY_ID,
      policyVersion: PLAN_STRUCTURE_POLICY_VERSION,
      path: 'primary',
      reasonCodes: [
        result.reused ? 'canonical_structure_reused' : 'canonical_structure_created',
      ],
      planId: result.planId,
      dateLocal: result.dateLocal,
      slotKey: result.slotKey,
      createdDay: result.createdDay,
      createdSlot: result.createdSlot,
      reused: result.reused,
    });
    return { ok: true, result };
  } catch {
    emitPlanStructureEvent({
      event: 'plan_structure_ensure_failed',
      policyId: PLAN_STRUCTURE_POLICY_ID,
      policyVersion: PLAN_STRUCTURE_POLICY_VERSION,
      path: 'primary',
      reasonCodes: ['structure_write_failed'],
      planId: args.planId,
      dateLocal: args.dateLocal,
      slotKey: args.slotKey,
      createdDay: false,
      createdSlot: false,
      reused: false,
    });
    return { ok: false, error: SAFE_ERROR, reasonCode: 'structure_write_failed' };
  }
}
