/**
 * Shared next-meal resolver for App Home welcome CTA and Today's Rhythm.
 * One authoritative definition — welcome and Rhythm must agree.
 */

import type { JournalEntry } from '@/lib/journal';
import { toDateKey } from '@/lib/journal';
import {
  buildMealSlotWindows,
  getMealSlotForEntry,
} from '@/lib/journal/mealScheduleAssignment';
import { hhmmToMinutes } from '@/lib/plans/scheduleResolver';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

export interface NextMealResolverInput {
  slots: ResolvedScheduleSlot[];
  todayEntries: JournalEntry[];
  now?: Date;
  dateKey?: string;
}

export interface NextMealSlotResult {
  slotKey: string;
  slotLabel: string;
  targetTime: string;
  logged: boolean;
  actionable: boolean;
  entryId: string | null;
  logHref: string;
  editHref: string | null;
}

export type NextMealResolverOutcome =
  | { kind: 'next_meal'; actionable: NextMealSlotResult; slots: NextMealSlotResult[] }
  | { kind: 'all_logged'; slots: NextMealSlotResult[] }
  | { kind: 'no_schedule'; slots: [] };

function formatTime12h(time24: string): string {
  const [hRaw, mRaw] = time24.split(':').map(Number);
  const h = hRaw ?? 0;
  const m = mRaw ?? 0;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${m.toString().padStart(2, '0')}${period}`;
}

export function formatSlotTimeLabel(time24: string): string {
  const [hRaw, mRaw] = time24.split(':').map(Number);
  const h = hRaw ?? 0;
  const m = mRaw ?? 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function buildLogHref(slot: ResolvedScheduleSlot, dateKey: string): string {
  const params = new URLSearchParams({
    tab: 'food',
    mealSlot: slot.key,
    date: dateKey,
    time: slot.target_time,
  });
  return `${APP_ROUTES.logNew}?${params.toString()}`;
}

export function findMatchingIntakeEntry(
  slot: ResolvedScheduleSlot,
  todayEntries: JournalEntry[],
  enabledSlots: ResolvedScheduleSlot[],
): JournalEntry | null {
  return (
    todayEntries.find((entry) => {
      if (entry.type !== 'intake') return false;
      return getMealSlotForEntry(entry, enabledSlots)?.key === slot.key;
    }) ?? null
  );
}

export function chooseActionableSlot(
  slots: ResolvedScheduleSlot[],
  todayEntries: JournalEntry[],
  now: Date = new Date(),
): ResolvedScheduleSlot | null {
  if (slots.length === 0) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const windows = buildMealSlotWindows(slots);
  const unloggedWindows = windows.filter(
    (window) => !findMatchingIntakeEntry(window.slot, todayEntries, slots),
  );
  if (unloggedWindows.length === 0) return null;

  const current = unloggedWindows.find(
    (window) => nowMinutes >= window.startMinute && nowMinutes < window.endMinute,
  );
  if (current) return current.slot;

  return (
    unloggedWindows.find((window) => hhmmToMinutes(window.slot.target_time) >= nowMinutes)
      ?.slot ??
    unloggedWindows[0]?.slot ??
    null
  );
}

export function resolveNextMeal(input: NextMealResolverInput): NextMealResolverOutcome {
  const now = input.now ?? new Date();
  const dateKey = input.dateKey ?? toDateKey(now);
  const slots = input.slots.filter((slot) => slot.enabled);

  if (slots.length === 0) {
    return { kind: 'no_schedule', slots: [] };
  }

  const actionableSlot = chooseActionableSlot(slots, input.todayEntries, now);
  const mapped: NextMealSlotResult[] = slots.map((slot) => {
    const entry = findMatchingIntakeEntry(slot, input.todayEntries, slots);
    const logged = Boolean(entry);
    const actionable = actionableSlot?.key === slot.key;
    return {
      slotKey: slot.key,
      slotLabel: slot.label,
      targetTime: slot.target_time,
      logged,
      actionable,
      entryId: entry?.id ?? null,
      logHref: buildLogHref(slot, dateKey),
      editHref: entry ? APP_ROUTE_BUILDERS.logEntry(entry.id) : null,
    };
  });

  if (!actionableSlot) {
    return { kind: 'all_logged', slots: mapped };
  }

  const actionable = mapped.find((slot) => slot.slotKey === actionableSlot.key)!;
  return { kind: 'next_meal', actionable, slots: mapped };
}

export function buildWelcomeSupportCopy(outcome: NextMealResolverOutcome): {
  supportCopy: string;
  ctaLabel: string;
  ctaHref: string;
  actionableSlotKey: string | null;
} {
  if (outcome.kind === 'no_schedule') {
    return {
      supportCopy: 'Set your meal times to make today’s guidance more useful.',
      ctaLabel: 'Set Meal Times',
      ctaHref: APP_ROUTES.profile,
      actionableSlotKey: null,
    };
  }

  if (outcome.kind === 'all_logged') {
    return {
      supportCopy: 'Today’s rhythm is complete. Review what you logged.',
      ctaLabel: 'Review Today',
      ctaHref: APP_ROUTES.log,
      actionableSlotKey: null,
    };
  }

  const timeLabel = formatTime12h(outcome.actionable.targetTime);
  const label = outcome.actionable.slotLabel.toLowerCase();
  return {
    supportCopy: `Let’s log your ${timeLabel} ${label}.`,
    ctaLabel: 'Log Meal',
    ctaHref: outcome.actionable.logHref,
    actionableSlotKey: outcome.actionable.slotKey,
  };
}

export function buildGreeting(firstName: string | null | undefined): string {
  const trimmed = typeof firstName === 'string' ? firstName.trim() : '';
  if (!trimmed || trimmed.includes('@')) {
    return 'Welcome back.';
  }
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  return `Hi ${first}, welcome back.`;
}
