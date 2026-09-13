import {
  getMealSlotForEntry,
} from './mealScheduleAssignment';
import {
  toDateKey,
  type JournalEntry,
  type TimeBlock,
} from './types';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';

export interface CommittedNutritionContext {
  dateKey: string;
  mealSlotKey?: string | null;
  block?: TimeBlock | null;
}

/**
 * Read-only projection of canonical intake history into one Log context.
 *
 * An explicit Meal Rhythm occasion is authoritative. Legacy links without an
 * occasion may fall back to their supplied broad time block, but never pick an
 * arbitrary repeated occasion merely because its label looks familiar.
 */
export function selectCommittedNutritionEntries(
  entries: JournalEntry[],
  context: CommittedNutritionContext,
  enabledSlots: ResolvedScheduleSlot[],
): JournalEntry[] {
  const intakeForDate = entries.filter(
    (entry) =>
      entry.type === 'intake' &&
      toDateKey(entry.timestamp) === context.dateKey,
  );

  if (context.mealSlotKey) {
    const target = enabledSlots.find(
      (slot) => slot.key === context.mealSlotKey,
    );
    if (!target) return [];
    return intakeForDate.filter(
      (entry) => getMealSlotForEntry(entry, enabledSlots)?.key === target.key,
    );
  }

  if (context.block) {
    return intakeForDate.filter((entry) => entry.block === context.block);
  }

  return [];
}
