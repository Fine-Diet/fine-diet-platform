import { parseLocalDate, toDateKey } from '@/lib/journal/types';
import type { PlanDay, PlanSlot, PlannedMeal } from './types';

export interface MonthDayProjection {
  dateLocal: string;
  hasDatedDay: boolean;
  planned: boolean;
  occupiedOccasionCount: number;
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentCalendarMonthKey(anchor: Date = new Date()): string {
  return toDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1)).slice(0, 7);
}

export function isCalendarMonthKey(value: unknown): value is string {
  if (typeof value !== 'string' || !MONTH_KEY_PATTERN.test(value)) return false;
  const [year, month] = value.split('-').map(Number);
  const parsed = new Date(year, (month ?? 1) - 1, 1);
  return currentCalendarMonthKey(parsed) === value;
}

export function resolveCalendarMonthKey(
  value: unknown,
  anchor: Date = new Date(),
): string {
  return isCalendarMonthKey(value) ? value : currentCalendarMonthKey(anchor);
}

export function shiftCalendarMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  return currentCalendarMonthKey(new Date(year, (month ?? 1) - 1 + delta, 1));
}

export function getVisibleCalendarDates(monthKey: string): string[] {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, (month ?? 1) - 1, 1);
  const last = new Date(year, month ?? 1, 0);
  const visibleStart = new Date(first);
  visibleStart.setDate(first.getDate() - first.getDay());
  const visibleEnd = new Date(last);
  visibleEnd.setDate(last.getDate() + (6 - last.getDay()));
  const dayCount =
    Math.round((visibleEnd.getTime() - visibleStart.getTime()) / 86_400_000) + 1;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(visibleStart);
    date.setDate(visibleStart.getDate() + index);
    return toDateKey(date);
  });
}

export function formatCalendarMonth(monthKey: string): string {
  return parseLocalDate(`${monthKey}-01`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function projectMonthPlanningState(
  dates: string[],
  planDays: PlanDay[],
  planSlots: PlanSlot[],
  meals: PlannedMeal[],
): MonthDayProjection[] {
  const dayByDate = new Map(planDays.map((day) => [day.date_local, day]));
  const slotById = new Map(planSlots.map((slot) => [slot.id, slot]));
  const mealsByDay = new Map<string, PlannedMeal[]>();

  for (const meal of meals) {
    mealsByDay.set(meal.plan_day_id, [
      ...(mealsByDay.get(meal.plan_day_id) ?? []),
      meal,
    ]);
  }

  return dates.map((dateLocal) => {
    const day = dayByDate.get(dateLocal);
    const dayMeals = day ? mealsByDay.get(day.id) ?? [] : [];
    const occupiedSlotIds = new Set(
      dayMeals.flatMap((meal) => {
        if (!meal.plan_slot_id) return [];
        const slot = slotById.get(meal.plan_slot_id);
        if (!slot || slot.plan_day_id !== day?.id) return [];
        return [slot.id];
      }),
    );

    return {
      dateLocal,
      hasDatedDay: Boolean(day),
      planned: dayMeals.length > 0,
      occupiedOccasionCount: occupiedSlotIds.size,
    };
  });
}
