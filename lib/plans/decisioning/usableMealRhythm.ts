/**
 * Usable Profile Meal Schedule detection for Packet 1 decisioning.
 *
 * normalizeMealSchedule fills missing JSON with three enabled meals, so NBA
 * must inspect the saved payload — not the normalized fallback — to know
 * whether the person actually has rhythm truth.
 */

import { MEAL_SLOT_KEYS, type MealSchedule, type MealSlotKey } from '@/lib/plans/types';

export function hasSavedMealSchedule(value: unknown): value is MealSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const slots = (value as { slots?: unknown }).slots;
  return Boolean(slots && typeof slots === 'object' && !Array.isArray(slots));
}

export function isUsableSavedMealSchedule(value: unknown): boolean {
  if (!hasSavedMealSchedule(value)) return false;
  const slots = value.slots as Partial<Record<MealSlotKey, { enabled?: unknown }>>;
  return MEAL_SLOT_KEYS.some((key) => slots[key]?.enabled === true);
}

export function enabledSavedSlotCount(value: unknown): number {
  if (!hasSavedMealSchedule(value)) return 0;
  const slots = value.slots as Partial<Record<MealSlotKey, { enabled?: unknown }>>;
  return MEAL_SLOT_KEYS.filter((key) => slots[key]?.enabled === true).length;
}
