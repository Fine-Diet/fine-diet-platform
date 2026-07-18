import { parseLocalDate, toDateKey } from '@/lib/journal/types';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import type { Plan, PlanDay } from './types';

export const MAX_PLAN_RANGE_DAYS = 31;

export interface DateRange {
  start: string;
  end: string;
}

export function todayLocalDateKey(): string {
  return toDateKey(new Date());
}

/** Sunday-through-Saturday calendar week for the anchor's local date. */
export function getCalendarWeekRange(anchor: Date = new Date()): DateRange {
  const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - date.getDay());
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  return {
    start: toDateKey(startDate),
    end: toDateKey(endDate),
  };
}

export function addDaysToDateKey(key: string, delta: number): string {
  const d = parseLocalDate(key);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function daysInRange(start: string, end: string): number {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

export function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Stricter than `isValidDateKey`: also rejects calendar-invalid dates like
 * `2026-13-45` or `2026-02-30`. `parseLocalDate` silently normalizes
 * out-of-range month/day components via native Date rollover, so we detect
 * that by round-tripping through `toDateKey` and comparing to the input.
 */
export function isRealCalendarDateKey(value: unknown): value is string {
  if (!isValidDateKey(value)) return false;
  return toDateKey(parseLocalDate(value)) === value;
}

export function clampDateRange(
  start: string,
  end: string,
  maxDays: number = MAX_PLAN_RANGE_DAYS,
): DateRange {
  let s = start;
  let e = end;
  if (compareDateKeys(s, e) > 0) {
    [s, e] = [e, s];
  }
  if (daysInRange(s, e) > maxDays) {
    e = addDaysToDateKey(s, maxDays - 1);
  }
  return { start: s, end: e };
}

export function resolvePlanWeekRangeFromQuery(
  queryStart?: string | string[] | null,
  queryEnd?: string | string[] | null,
): DateRange {
  const startRaw = Array.isArray(queryStart) ? queryStart[0] : queryStart;
  const endRaw = Array.isArray(queryEnd) ? queryEnd[0] : queryEnd;

  if (isValidDateKey(startRaw) && isValidDateKey(endRaw)) {
    return clampDateRange(startRaw, endRaw);
  }
  if (isValidDateKey(startRaw)) {
    return clampDateRange(startRaw, startRaw);
  }
  return getCalendarWeekRange();
}

export function isCurrentCalendarWeek(start: string, end: string): boolean {
  const current = getCalendarWeekRange();
  return start === current.start && end === current.end;
}

export function filterPlanDaysInRange(
  days: PlanDay[],
  start: string,
  end: string,
): PlanDay[] {
  return days
    .filter((day) => day.date_local >= start && day.date_local <= end)
    .sort((a, b) => a.date_local.localeCompare(b.date_local));
}

/** Shift a range by delta days while preserving its span. */
export function shiftDateRangeByDays(range: DateRange, deltaDays: number): DateRange {
  const span = daysInRange(range.start, range.end) - 1;
  const newStart = addDaysToDateKey(range.start, deltaDays);
  const newEnd = addDaysToDateKey(newStart, span);
  return clampDateRange(newStart, newEnd);
}

export function buildPlanGroceryRangeHref(
  planId: string,
  start: string,
  end: string,
): string {
  const params = new URLSearchParams({ date: start });
  if (end !== start) params.set('date_end', end);
  return `${APP_ROUTE_BUILDERS.planGrocery(planId)}?${params.toString()}`;
}

export type PlanDayLinkKind = 'day' | 'generate_week' | 'plans_overview';

export interface ResolvedPlanDayLink {
  kind: PlanDayLinkKind;
  href: string;
  label: string;
}

export function findPlanDayByDate(days: PlanDay[], dateKey: string): PlanDay | null {
  return days.find((day) => day.date_local === dateKey) ?? null;
}

export function buildPlanWeekActionHref(
  range: DateRange,
  action?: 'generate',
): string {
  const params = new URLSearchParams({ start: range.start, end: range.end });
  if (action) params.set('action', action);
  return `${APP_ROUTES.plansWeek}?${params.toString()}`;
}

export function buildPlanDayHrefForExistingDay(
  plan: Pick<Plan, 'id'>,
  day: PlanDay,
): string {
  return `${APP_ROUTE_BUILDERS.planDay(day.date_local)}?planId=${encodeURIComponent(plan.id)}`;
}

/**
 * Resolve navigation for a calendar date without linking to a missing plan_day row.
 */
export function resolvePlanDayNavigation(args: {
  plan: Pick<Plan, 'id'> | null | undefined;
  days: PlanDay[];
  dateKey?: string;
  selectedRange?: DateRange;
  plansFallback?: string;
}): ResolvedPlanDayLink {
  const dateKey = args.dateKey ?? todayLocalDateKey();
  const plansFallback = args.plansFallback ?? APP_ROUTES.plans;
  const range = args.selectedRange ?? getCalendarWeekRange();

  if (!args.plan?.id) {
    return { kind: 'plans_overview', href: plansFallback, label: 'Open Plans' };
  }

  const existingDay = findPlanDayByDate(args.days, dateKey);
  if (existingDay) {
    return {
      kind: 'day',
      href: buildPlanDayHrefForExistingDay(args.plan, existingDay),
      label: "View today's plan",
    };
  }

  return {
    kind: 'generate_week',
    href: buildPlanWeekActionHref(range, 'generate'),
    label: 'Generate plan for this range',
  };
}

export function buildActivePlanDayHref(
  plan: Pick<Plan, 'id'> | null | undefined,
  days: PlanDay[],
  dateKey: string = todayLocalDateKey(),
  selectedRange: DateRange = getCalendarWeekRange(),
  plansFallback: string = APP_ROUTES.plans,
): string {
  return resolvePlanDayNavigation({
    plan,
    days,
    dateKey,
    selectedRange,
    plansFallback,
  }).href;
}

export function derivePlanGenerateRequest(range: DateRange): {
  plan_shape: 'week' | 'multi_day';
  start_date: string;
  end_date?: string;
} {
  if (daysInRange(range.start, range.end) === 7) {
    return { plan_shape: 'week', start_date: range.start };
  }
  return {
    plan_shape: 'multi_day',
    start_date: range.start,
    end_date: range.end,
  };
}
