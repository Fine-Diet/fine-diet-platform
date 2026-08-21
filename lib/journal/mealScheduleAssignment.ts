import type { JournalEntry, MealScheduleContext } from './types';
import {
  MEAL_OCCASION_KEYS,
  type MealOccasionKey,
  type MealSchedule,
  type ResolvedScheduleSlot,
} from '@/lib/plans/types';
import {
  coerceMealOccasionKey,
  isScheduleSlotKey,
  matchOccasionKeyInSlots,
} from '@/lib/plans/mealScheduleCompat';
import {
  hhmmToMinutes,
  normalizeMealSchedule,
  resolveMealSchedule,
} from '@/lib/plans/scheduleResolver';

export interface MealSlotWindow {
  slot: ResolvedScheduleSlot;
  startMinute: number;
  endMinute: number;
}

const DAY_START_MINUTE = 0;
const DAY_END_MINUTE = 24 * 60;

/** True for current v2 occasion keys. */
export function isMealSlotKey(value: unknown): value is MealOccasionKey {
  return typeof value === 'string' && (MEAL_OCCASION_KEYS as readonly string[]).includes(value);
}

/**
 * Accepts v1 legacy or v2 occasion keys (deep links, journal history).
 * Prefer coerceMealOccasionKey when you need a canonical current key.
 */
export function isScheduleSlotKeyRef(value: unknown): boolean {
  return isScheduleSlotKey(value);
}

export function getEnabledMealSlots(schedule: MealSchedule | unknown): ResolvedScheduleSlot[] {
  const normalized = normalizeMealSchedule(schedule);
  return resolveMealSchedule({
    profile_schedule: normalized,
    program_overrides: [],
  }).resolved_slots.filter((slot) => slot.enabled);
}

export function buildMealSlotWindows(slots: ResolvedScheduleSlot[]): MealSlotWindow[] {
  const ordered = slots
    .filter((slot) => slot.enabled)
    .slice()
    .sort((a, b) => hhmmToMinutes(a.target_time) - hhmmToMinutes(b.target_time));

  return ordered.map((slot, index) => {
    const previous = ordered[index - 1] ?? null;
    const next = ordered[index + 1] ?? null;
    const slotMinute = hhmmToMinutes(slot.target_time);
    const startMinute = previous
      ? Math.round((hhmmToMinutes(previous.target_time) + slotMinute) / 2)
      : DAY_START_MINUTE;
    const endMinute = next
      ? Math.round((slotMinute + hhmmToMinutes(next.target_time)) / 2)
      : DAY_END_MINUTE;

    return { slot, startMinute, endMinute };
  });
}

export function assignTimestampToMealSlot(
  timestamp: Date,
  slots: ResolvedScheduleSlot[],
): ResolvedScheduleSlot | null {
  const windows = buildMealSlotWindows(slots);
  if (windows.length === 0) return null;

  const minute = timestamp.getHours() * 60 + timestamp.getMinutes();
  const match = windows.find((window, index) => {
    const isLast = index === windows.length - 1;
    return minute >= window.startMinute && (minute < window.endMinute || isLast);
  });

  return match?.slot ?? windows[windows.length - 1]?.slot ?? null;
}

export function getEntryMealScheduleContext(entry: JournalEntry): MealScheduleContext | null {
  const raw = (entry.payload as Record<string, unknown>).meal_schedule_context;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const context = raw as Record<string, unknown>;
  if (!isScheduleSlotKey(context.slot_key)) return null;
  if (context.assignment_source !== 'auto' && context.assignment_source !== 'manual') return null;

  return {
    slot_key: context.slot_key,
    slot_label: typeof context.slot_label === 'string' ? context.slot_label : '',
    slot_target_time: typeof context.slot_target_time === 'string' ? context.slot_target_time : '',
    assignment_source: context.assignment_source,
    meal_schedule_updated_at:
      typeof context.meal_schedule_updated_at === 'string' || context.meal_schedule_updated_at === null
        ? context.meal_schedule_updated_at
        : null,
  };
}

export function getMealSlotForEntry(
  entry: JournalEntry,
  slots: ResolvedScheduleSlot[],
): ResolvedScheduleSlot | null {
  const context = getEntryMealScheduleContext(entry);
  if (context) {
    const matchedKey = matchOccasionKeyInSlots(
      context.slot_key,
      slots.map((slot) => slot.key),
    );
    if (matchedKey) {
      const contextSlot = slots.find((slot) => slot.key === matchedKey);
      if (contextSlot) return contextSlot;
    }
  }

  return assignTimestampToMealSlot(entry.timestamp, slots);
}

export function buildMealScheduleContext(
  slot: ResolvedScheduleSlot,
  assignmentSource: MealScheduleContext['assignment_source'],
  schedule: MealSchedule | null,
): MealScheduleContext {
  return {
    slot_key: slot.key,
    slot_label: slot.label,
    slot_target_time: slot.target_time,
    assignment_source: assignmentSource,
    meal_schedule_updated_at: schedule?.updated_at ?? null,
  };
}

/** Resolve a query/deep-link mealSlot param (legacy or v2) to a current occasion. */
export function resolveMealSlotQueryParam(value: unknown): MealOccasionKey | null {
  return coerceMealOccasionKey(value);
}
