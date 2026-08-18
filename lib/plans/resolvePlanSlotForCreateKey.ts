/**
 * Map a Plans Home meal-schedule slot key to a concrete plan-day slot.
 * Fail closed for unknown keys — do not open an arbitrary empty slot.
 */

import type { PlanSlot } from './types';

export function resolvePlanSlotForCreateKey(
  keyRaw: string,
  daySlots: PlanSlot[],
): PlanSlot | null {
  const key = keyRaw.toLowerCase().trim().replace(/-/g, '_');
  if (!key) return null;

  const indexed = daySlots.map((slot) => ({
    slot,
    label: (slot.slot_label ?? '').toLowerCase(),
    block: (slot.slot_block ?? '').toLowerCase(),
  }));

  const find = (pred: (entry: (typeof indexed)[number]) => boolean) =>
    indexed.find(pred)?.slot ?? null;

  const isSnackish = (label: string) =>
    label.includes('snack') || label.includes('mini');

  switch (key) {
    case 'breakfast':
      return find((entry) => entry.label.includes('breakfast'));
    case 'lunch':
      return find((entry) => entry.label.includes('lunch'));
    case 'dinner':
      return find((entry) => entry.label.includes('dinner'));
    case 'morning_snack':
      return (
        find(
          (entry) =>
            entry.label.includes('morning') && isSnackish(entry.label),
        ) ??
        find(
          (entry) =>
            entry.block === 'morning' && isSnackish(entry.label),
        )
      );
    case 'afternoon_snack':
      return (
        find(
          (entry) =>
            (entry.label.includes('afternoon') ||
              entry.label.includes('mini-meal') ||
              entry.label.includes('mini meal')) &&
            isSnackish(entry.label),
        ) ??
        find((entry) => entry.label.includes('afternoon') && isSnackish(entry.label))
      );
    case 'evening_snack':
      return (
        find(
          (entry) =>
            entry.label.includes('evening') && isSnackish(entry.label),
        ) ??
        find(
          (entry) =>
            entry.block === 'evening' && isSnackish(entry.label),
        )
      );
    default: {
      const phrase = key.replace(/_/g, ' ');
      return find(
        (entry) => entry.label === phrase || entry.label.includes(phrase),
      );
    }
  }
}
