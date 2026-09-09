/**
 * Pure builders for Plans Home live guidance from plan detail + schedule.
 */

import { resolveGeneratedPlanEndDate } from '@/lib/plans/currentPlan';
import { getCalendarWeekRange, addDaysToDateKey } from '@/lib/plans/planDateRange';
import { findMealForScheduleSlot } from '@/lib/plans/matchScheduleSlot';
import { canonicalMealsByStructuralSlot } from '@/lib/plans/canonicalSlotMeals';
import { resolvePlanSlotForCreateKey } from '@/lib/plans/resolvePlanSlotForCreateKey';
import { projectDailyNDS } from '@/lib/plans/projection';
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

export type PlanDateCoverage = { start: string; end: string };

/**
 * Resolve the inclusive date coverage of an active plan from plan_days when
 * present, else from start_date / resolved end_date.
 */
export function resolvePlanDateCoverage(args: {
  plan: Pick<Plan, 'start_date' | 'end_date' | 'plan_shape'>;
  days: Array<Pick<PlanDay, 'date_local'>>;
}): PlanDateCoverage {
  const dayDates = args.days
    .map((day) => day.date_local)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => a.localeCompare(b));

  const start = dayDates[0] ?? args.plan.start_date;
  const end =
    resolveGeneratedPlanEndDate({
      end_date: args.plan.end_date,
      start_date: args.plan.start_date,
      plan_shape: args.plan.plan_shape,
      planDayDates: dayDates,
    }) ??
    dayDates[dayDates.length - 1] ??
    args.plan.start_date;

  return start <= end ? { start, end } : { start: end, end: start };
}

export function isDateInPlanCoverage(
  date: string,
  coverage: PlanDateCoverage,
): boolean {
  return date >= coverage.start && date <= coverage.end;
}

/**
 * Default selected date for Plans Home.
 *
 * - Explicit ?date always wins.
 * - If today falls inside the active plan range, default to today.
 * - If today is outside the plan range, keep today (do NOT silently jump to
 *   the expired plan's start_date) and mark inRange=false.
 */
export function resolveDefaultPlansHomeSelectedDate(args: {
  today: string;
  plan: Pick<Plan, 'start_date' | 'end_date' | 'plan_shape'> | null;
  days: Array<Pick<PlanDay, 'date_local'>>;
  explicitDate?: string | null;
}): { selectedDate: string; inRange: boolean; coverage: PlanDateCoverage | null } {
  if (!args.plan) {
    return {
      selectedDate: args.explicitDate ?? args.today,
      inRange: false,
      coverage: null,
    };
  }

  const coverage = resolvePlanDateCoverage({
    plan: args.plan,
    days: args.days,
  });

  if (args.explicitDate) {
    return {
      selectedDate: args.explicitDate,
      inRange: isDateInPlanCoverage(args.explicitDate, coverage),
      coverage,
    };
  }

  if (isDateInPlanCoverage(args.today, coverage)) {
    return { selectedDate: args.today, inRange: true, coverage };
  }

  return { selectedDate: args.today, inRange: false, coverage };
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
      ? canonicalMealsByStructuralSlot(
          meals.filter((meal) => meal.plan_day_id === planDay.id),
        )
      : [];

    return {
      date,
      weekdayShort: weekdayShort(date),
      dayOfMonth: dayOfMonth(date),
      markers: scheduleSlots.map((slot) => {
        const meal = findMealForScheduleSlot(slot, dayMeals, daySlots, scheduleSlots);
        return {
          slotKey: slot.key,
          planned: Boolean(meal),
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
    ? canonicalMealsByStructuralSlot(
        meals.filter((meal) => meal.plan_day_id === planDay.id),
      )
    : [];

  return scheduleSlots.map((slot) => {
    const meal = findMealForScheduleSlot(slot, dayMeals, daySlots, scheduleSlots);
    const planSlot = resolvePlanSlotForCreateKey(slot.key, daySlots, {
      enabledSlots: scheduleSlots,
    });
    return {
      slotKey: slot.key,
      targetTimeLabel: compactTimeLabel(slot.target_time),
      targetTimeValue: slot.target_time,
      label: slot.label,
      mealName: meal?.name ?? null,
      mealId: meal?.id ?? null,
      meal,
      planSlot,
      journalEntryId: meal?.journal_entry_id ?? null,
      state: mealExecutionToWindowState(meal),
    };
  });
}

function planningCounts(rows: PlansMealGuidanceRow[]): {
  plannedCount: number;
  totalCount: number;
} {
  return {
    plannedCount: rows.filter((row) => Boolean(row.mealId)).length,
    totalCount: rows.length,
  };
}

export function plannedMealCalories(meal: PlannedMeal): number | null {
  const derived = meal.meal_derived_data as { meal_calories?: unknown } | null;
  if (
    derived &&
    typeof derived.meal_calories === 'number' &&
    Number.isFinite(derived.meal_calories) &&
    derived.meal_calories >= 0
  ) {
    return derived.meal_calories;
  }
  const totals = (meal.payload as { totals?: { calories?: unknown } }).totals;
  return typeof totals?.calories === 'number' &&
    Number.isFinite(totals.calories) &&
    totals.calories >= 0
    ? totals.calories
    : null;
}

function selectedDayNutrition(args: {
  selectedDate: string;
  days: PlanDay[];
  meals: PlannedMeal[];
}): { projectedNds: number | null; plannedCalories: number | null } {
  const day = args.days.find((candidate) => candidate.date_local === args.selectedDate) ?? null;
  if (!day) return { projectedNds: null, plannedCalories: null };
  const persistedMeals = args.meals.filter((meal) => meal.plan_day_id === day.id);
  const meals = canonicalMealsByStructuralSlot(persistedMeals);
  const hadStructuralDuplicates = meals.length !== persistedMeals.length;
  const calories = meals
    .map(plannedMealCalories)
    .filter((value): value is number => value != null);
  return {
    // Empty structural days are initialized with zero projection columns.
    // Meal presence distinguishes that placeholder from a real projection.
    projectedNds:
      meals.length === 0
        ? null
        : hadStructuralDuplicates
          ? projectDailyNDS(meals).nds_score_100
          : typeof day.projected_nds_100 === 'number' &&
              Number.isFinite(day.projected_nds_100)
            ? day.projected_nds_100
            : null,
    plannedCalories:
      calories.length > 0
        ? calories.reduce((total, value) => total + value, 0)
        : null,
  };
}

export function buildPlansHomeGuidance(args: {
  plan: Plan | null;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
  scheduleSlots: ResolvedScheduleSlot[];
  selectedDate: string;
  hasSchedule: boolean;
  dailyCalorieGoal?: number | null;
  errorMessage?: string;
  /**
   * When false, the selected date is outside the active plan's coverage.
   * Defaults to true so historical ?date views that are in-range still ready.
   */
  dateInPlanRange?: boolean;
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
    dailyCalorieGoal = null,
    dateInPlanRange = true,
  } = args;

  if (errorMessage) {
    return {
      status: 'error',
      selectedDate,
      days: [],
      rows: [],
      planId: plan?.id ?? null,
      plannedCount: 0,
      totalCount: 0,
      projectedNds: null,
      plannedCalories: null,
      dailyCalorieGoal,
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
      plannedCount: 0,
      totalCount: 0,
      projectedNds: null,
      plannedCalories: null,
      dailyCalorieGoal,
    };
  }

  if (!plan) {
    const rows = scheduleSlots.map((slot) => ({
      slotKey: slot.key,
      targetTimeLabel: compactTimeLabel(slot.target_time),
      targetTimeValue: slot.target_time,
      label: slot.label,
      mealName: null,
      mealId: null,
      journalEntryId: null,
      state: 'empty' as const,
    }));
    return {
      status: 'no_active_plan',
      selectedDate,
      days: buildWeekDays(selectedDate, scheduleSlots, [], [], []),
      rows,
      planId: null,
      ...planningCounts(rows),
      projectedNds: null,
      plannedCalories: null,
      dailyCalorieGoal,
    };
  }

  if (!dateInPlanRange) {
    const rows = buildRowsForDate(selectedDate, scheduleSlots, days, slots, meals);
    const nutrition = selectedDayNutrition({ selectedDate, days, meals });
    return {
      status: 'out_of_range',
      selectedDate,
      days: buildWeekDays(selectedDate, scheduleSlots, days, slots, meals),
      rows,
      planId: plan.id,
      ...planningCounts(rows),
      ...nutrition,
      dailyCalorieGoal,
      errorMessage:
        'This date is outside the active plan. You can still plan it or choose another date.',
    };
  }

  const rows = buildRowsForDate(selectedDate, scheduleSlots, days, slots, meals);
  const nutrition = selectedDayNutrition({ selectedDate, days, meals });
  return {
    status: 'ready',
    selectedDate,
    planId: plan.id,
    days: buildWeekDays(selectedDate, scheduleSlots, days, slots, meals),
    rows,
    ...planningCounts(rows),
    ...nutrition,
    dailyCalorieGoal,
  };
}
