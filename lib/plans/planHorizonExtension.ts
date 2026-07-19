/**
 * Extend an active plan's dated horizon with structural plan_days + schedule slots.
 */

import { addDaysToDateKey, compareDateKeys } from '@/lib/plans/planDateRange';
import type { Plan, PlanDay, ResolvedScheduleSlot } from '@/lib/plans/types';

export function listMissingPlanDatesThrough(
  existingDays: PlanDay[],
  requiredEndDateLocal: string,
): string[] {
  const existingDates = new Set(existingDays.map((day) => day.date_local));
  const ordered = [...existingDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const lastDate = ordered[ordered.length - 1]?.date_local;
  if (!lastDate) return [];

  if (compareDateKeys(requiredEndDateLocal, lastDate) <= 0) {
    return [];
  }

  const missing: string[] = [];
  let cursor = lastDate;
  while (compareDateKeys(cursor, requiredEndDateLocal) < 0) {
    cursor = addDaysToDateKey(cursor, 1);
    if (!existingDates.has(cursor)) {
      missing.push(cursor);
      existingDates.add(cursor);
    }
  }
  return missing;
}

export function buildStructuralPlanSlotRows(
  scheduleSlots: ResolvedScheduleSlot[],
): Array<{
  slot_block: ResolvedScheduleSlot['slot_block'];
  slot_ordinal: number;
  slot_label: string | null;
  target_time: string | null;
}> {
  return scheduleSlots
    .filter((slot) => slot.enabled)
    .map((slot, index) => ({
      slot_block: slot.slot_block,
      slot_ordinal: index + 1,
      slot_label: slot.label,
      target_time: slot.target_time,
    }));
}

export interface PlanHorizonScheduleResolution {
  scheduleSlots: ResolvedScheduleSlot[];
  usedLegacyFallback: boolean;
}

/**
 * Resolve which schedule to use when extending a plan's dated horizon.
 *
 * Horizon extension must preserve the *plan's own* historical schedule —
 * including any program-required/disallowed slot structure that was frozen
 * into `input_snapshot_json.schedule_snapshot` at generation time — rather
 * than the person's *current* profile schedule, which may have changed
 * since the plan was created (or since a program assignment ended). We
 * only fall back to the live profile schedule when the plan predates the
 * schedule_snapshot field or otherwise carries no usable resolved slots,
 * and that fallback is reported back to the caller so it can be surfaced
 * (and tested) explicitly rather than silently substituted.
 */
export function resolvePlanHorizonScheduleSlots(
  plan: Pick<Plan, 'input_snapshot_json'>,
  legacyProfileScheduleSlots: ResolvedScheduleSlot[],
): PlanHorizonScheduleResolution {
  const snapshotSlots = plan.input_snapshot_json?.schedule_snapshot?.resolved_slots;
  if (Array.isArray(snapshotSlots) && snapshotSlots.length > 0) {
    return { scheduleSlots: snapshotSlots, usedLegacyFallback: false };
  }
  return { scheduleSlots: legacyProfileScheduleSlots, usedLegacyFallback: true };
}
