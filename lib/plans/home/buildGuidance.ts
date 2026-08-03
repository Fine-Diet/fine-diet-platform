/**
 * Pure builders for Plans Home live guidance from plan detail + schedule.
 */

import { getCalendarWeekRange, addDaysToDateKey } from '@/lib/plans/planDateRange';
import { findMealForScheduleSlot } from '@/lib/plans/matchScheduleSlot';
import type {
  Plan,
  PlanDay,
  PlannedMeal,
  PlanSlot,
  ResolvedScheduleSlot,
} from '@/lib/plans/types';
import type {
  PlansMealGuidanceDay,
  PlansMealGuidanceRow,
  PlansMealGuidanceViewModel,
  PlansMealWindowState,
} from './types';

function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()]!;
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Keep fixture-like compact labels ("11:00" / "2:00") for the guidance list. */
function compactTimeLabel(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const hour12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${hour12}:00` : `${hour12}:${String(m).padStart(2, '0')}`;
}

export function mealExecutionToWindowState(
  meal: PlannedMeal | null,
): PlansMealWindowState {
  if (!meal) return 'empty';
  switch (meal.execution_state) {
    case 'eaten':
      return 'eaten';
    case 'skipped':
      return 'skipped';
    case 'pending':
      return 'pending';
    default:
      return 'unknown';
  }
}

function buildWeekDays(
  selectedDate: string,
  scheduleSlots: ResolvedScheduleSlot[],
  days: PlanDay[],
  slots: PlanSlot[],
  meals: PlannedMeal[],
): PlansMealGuidanceDay[] {
  const range = getCalendarWeekRange(
    new Date(
      Number(selectedDate.slice(0, 4)),
      Number(selectedDate.slice(5, 7)) - 1,
      Number(selectedDate.slice(8, 10)),
    ),
  );

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToDateKey(range.start, index);
    const planDay = days.find((day) => day.date_local === date) ?? null;
    const daySlots = planDay
      ? slots.filter((slot) => slot.plan_day_id === planDay.id)
      : [];
    const dayMeals = planDay
      ? meals.filter((meal) => meal.plan_day_id === planDay.id)
      : [];

    return {
      date,
      weekdayShort: weekdayShort(date),
      dayOfMonth: dayOfMonth(date),
      markers: scheduleSlots.map((slot) => {
        const meal = findMealForScheduleSlot(slot, dayMeals, daySlots);
        return {
          slotKey: slot.key,
          state: mealExecutionToWindowState(meal),
        };
      }),
    };
  });
}

function buildRowsForDate(
  selectedDate: string,
  scheduleSlots: ResolvedScheduleSlot[],
  days: PlanDay[],
  slots: PlanSlot[],
  meals: PlannedMeal[],
): PlansMealGuidanceRow[] {
  const planDay = days.find((day) => day.date_local === selectedDate) ?? null;
  const daySlots = planDay
    ? slots.filter((slot) => slot.plan_day_id === planDay.id)
    : [];
  const dayMeals = planDay
    ? meals.filter((meal) => meal.plan_day_id === planDay.id)
    : [];

  return scheduleSlots.map((slot) => {
    const meal = findMealForScheduleSlot(slot, dayMeals, daySlots);
    return {
      slotKey: slot.key,
      targetTimeLabel: compactTimeLabel(slot.target_time),
      targetTimeValue: slot.target_time,
      label: slot.label,
      mealName: meal?.name ?? null,
      mealId: meal?.id ?? null,
      state: mealExecutionToWindowState(meal),
    };
  });
}

export function buildPlansHomeGuidance(args: {
  plan: Plan | null;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
  scheduleSlots: ResolvedScheduleSlot[];
  selectedDate: string;
  hasSchedule: boolean;
  errorMessage?: string;
}): PlansMealGuidanceViewModel {
  const {
    plan,
    days,
    slots,
    meals,
    scheduleSlots,
    selectedDate,
    hasSchedule,
    errorMessage,
  } = args;

  if (errorMessage) {
    return {
      status: 'error',
      selectedDate,
      days: [],
      rows: [],
      planId: plan?.id ?? null,
      errorMessage,
    };
  }

  if (!hasSchedule || scheduleSlots.length === 0) {
    return {
      status: 'no_schedule',
      selectedDate,
      days: [],
      rows: [],
      planId: plan?.id ?? null,
    };
  }

  if (!plan) {
    return {
      status: 'no_active_plan',
      selectedDate,
      days: buildWeekDays(selectedDate, scheduleSlots, [], [], []),
      rows: scheduleSlots.map((slot) => ({
        slotKey: slot.key,
        targetTimeLabel: compactTimeLabel(slot.target_time),
        targetTimeValue: slot.target_time,
        label: slot.label,
        mealName: null,
        mealId: null,
        state: 'empty' as const,
      })),
      planId: null,
    };
  }

  return {
    status: 'ready',
    selectedDate,
    planId: plan.id,
    days: buildWeekDays(selectedDate, scheduleSlots, days, slots, meals),
    rows: buildRowsForDate(selectedDate, scheduleSlots, days, slots, meals),
  };
}
