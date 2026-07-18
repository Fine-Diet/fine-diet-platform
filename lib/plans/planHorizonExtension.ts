/**
 * Extend an active plan's dated horizon with structural plan_days + schedule slots.
 */

import { addDaysToDateKey, compareDateKeys } from '@/lib/plans/planDateRange';
import type { PlanDay, ResolvedScheduleSlot } from '@/lib/plans/types';

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
