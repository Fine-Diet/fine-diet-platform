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
