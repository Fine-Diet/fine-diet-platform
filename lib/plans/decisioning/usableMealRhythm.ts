/**
 * Usable Profile Meal Schedule detection for Packet 1 decisioning.
 *
 * normalizeMealSchedule fills missing JSON with three enabled meals, so NBA
 * must inspect the saved payload — not the normalized fallback — to know
 * whether the person actually has rhythm truth.
 *
 * Dual-reads legacy v1 and current v2 slot/occasion keys.
 */

import {
  coerceMealOccasionKey,
  isLegacyMealSlotKey,
  isMealOccasionKey,
} from '@/lib/plans/mealScheduleCompat';
import {
  LEGACY_MEAL_SLOT_KEYS,
  MEAL_OCCASION_KEYS,
  type MealSchedule,
} from '@/lib/plans/types';

export function hasSavedMealSchedule(value: unknown): value is MealSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const slots = (value as { slots?: unknown }).slots;
  return Boolean(slots && typeof slots === 'object' && !Array.isArray(slots));
}

function enabledFlag(slots: Record<string, { enabled?: unknown }>, key: string): boolean {
  return slots[key]?.enabled === true;
}

export function isUsableSavedMealSchedule(value: unknown): boolean {
  if (!hasSavedMealSchedule(value)) return false;
  const slots = value.slots as Record<string, { enabled?: unknown }>;
  for (const key of MEAL_OCCASION_KEYS) {
    if (enabledFlag(slots, key)) return true;
  }
  for (const key of LEGACY_MEAL_SLOT_KEYS) {
    if (enabledFlag(slots, key)) return true;
  }
  return false;
}

export function enabledSavedSlotCount(value: unknown): number {
  if (!hasSavedMealSchedule(value)) return 0;
  const slots = value.slots as Record<string, { enabled?: unknown }>;
  const counted = new Set<string>();
  for (const rawKey of Object.keys(slots)) {
    if (!enabledFlag(slots, rawKey)) continue;
    if (isMealOccasionKey(rawKey) || isLegacyMealSlotKey(rawKey)) {
      const occasion = coerceMealOccasionKey(rawKey);
      if (occasion) counted.add(occasion);
    }
  }
  return counted.size;
}
