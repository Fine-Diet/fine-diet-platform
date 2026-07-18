import { addDaysToDateKey } from '@/lib/plans/planDateRange';
import type { PlanDay } from '@/lib/plans/types';

export const CONTIGUOUS_PLAN_DAYS_ERROR =
  'Week patterns must be created from contiguous calendar days.';

export function assertContiguousDateKeys(sortedDateKeys: string[]): void {
  if (sortedDateKeys.length <= 1) return;
  for (let i = 1; i < sortedDateKeys.length; i += 1) {
    const expected = addDaysToDateKey(sortedDateKeys[i - 1]!, 1);
    if (sortedDateKeys[i] !== expected) {
      throw new Error(CONTIGUOUS_PLAN_DAYS_ERROR);
    }
  }
}

export function assertContiguousPlanDays(days: PlanDay[]): void {
  const sorted = [...days].sort((a, b) => a.date_local.localeCompare(b.date_local));
  assertContiguousDateKeys(sorted.map((day) => day.date_local));
}

/**
 * How many consecutive days are selectable starting at `startDayId`, given
 * `orderedPlanDays` sorted ascending by date_local. Used to drive a
 * consecutive-range picker UI (start day + day count) that structurally
 * cannot produce a nonconsecutive selection, instead of a free multi-select
 * that only rejects bad selections after submit.
 */
export function maxConsecutiveDayCountFrom(
  orderedPlanDays: PlanDay[],
  startDayId: string,
): number {
  const startIndex = orderedPlanDays.findIndex((day) => day.id === startDayId);
  if (startIndex < 0) return 0;
  return orderedPlanDays.length - startIndex;
}

export interface ConsecutiveDayRangeResult {
  days: PlanDay[] | null;
  error?: string;
}

/**
 * Resolve a consecutive range of plan days starting at `startDayId` and
 * spanning `dayCount` days, using positional offsets into the already
 * date-sorted `orderedPlanDays`. Returns an error instead of throwing so
 * callers can render inline guidance rather than catching an exception
 * after submission.
 */
export function resolveConsecutiveDayRange(
  orderedPlanDays: PlanDay[],
  startDayId: string,
  dayCount: number,
): ConsecutiveDayRangeResult {
  if (!Number.isInteger(dayCount) || dayCount < 1) {
    return { days: null, error: 'Day count must be a positive integer.' };
  }
  const startIndex = orderedPlanDays.findIndex((day) => day.id === startDayId);
  if (startIndex < 0) {
    return { days: null, error: 'Selected start day was not found in the active plan.' };
  }
  const available = orderedPlanDays.length - startIndex;
  if (dayCount > available) {
    return {
      days: null,
      error: `Only ${available} consecutive day${available === 1 ? '' : 's'} are available from this start day.`,
    };
  }
  const selected = orderedPlanDays.slice(startIndex, startIndex + dayCount);
  try {
    assertContiguousDateKeys(selected.map((day) => day.date_local));
  } catch {
    return {
      days: null,
      error:
        'Your dated plan has a gap or duplicate date in this range, so a contiguous pattern cannot be created here.',
    };
  }
  return { days: selected };
}
