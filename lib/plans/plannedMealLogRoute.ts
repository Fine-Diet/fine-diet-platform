/**
 * Planned-meal Log route builder and parser.
 *
 * Canonical Adjust & log / planned-context deep links:
 *   /app/log/new?date=YYYY-MM-DD&time=HH:mm&mealSlot=<key>&plannedMealId=<uuid>&mode=planned&redirect=<encoded>
 */
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { resolveMealSlotQueryParam } from '@/lib/journal/mealScheduleAssignment';
import type { MealSlotKey } from '@/lib/plans/types';

export const PLANNED_MEAL_LOG_MODE = 'planned' as const;

export interface PlannedMealLogQuery {
  date: string | null;
  time: string | null;
  mealSlot: MealSlotKey | null;
  plannedMealId: string | null;
  mode: typeof PLANNED_MEAL_LOG_MODE | null;
  redirect: string;
}

export interface BuildPlannedMealLogHrefInput {
  date: string;
  time?: string | null;
  mealSlot?: MealSlotKey | string | null;
  plannedMealId: string;
  redirect?: string | null;
  mode?: typeof PLANNED_MEAL_LOG_MODE;
}

export function buildPlannedMealLogHref(input: BuildPlannedMealLogHrefInput): string {
  const params = new URLSearchParams();
  params.set('tab', 'food');
  params.set('date', input.date);
  if (input.time) params.set('time', input.time);
  if (input.mealSlot) params.set('mealSlot', String(input.mealSlot));
  params.set('plannedMealId', input.plannedMealId);
  params.set('mode', input.mode ?? PLANNED_MEAL_LOG_MODE);
  const redirect = getSafeRedirectTarget(input.redirect ?? null, APP_ROUTES.log);
  params.set('redirect', redirect);
  return `${APP_ROUTES.logNew}?${params.toString()}`;
}

export function parsePlannedMealLogQuery(
  query: Record<string, string | string[] | undefined>,
  redirectFallback = APP_ROUTES.log,
): PlannedMealLogQuery {
  const raw = (key: string): string | null => {
    const v = query[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
    return null;
  };

  const mealSlotRaw = raw('mealSlot');
  const mealSlot = resolveMealSlotQueryParam(mealSlotRaw);
  const modeRaw = raw('mode');
  const mode = modeRaw === PLANNED_MEAL_LOG_MODE ? PLANNED_MEAL_LOG_MODE : null;

  return {
    date: raw('date'),
    time: raw('time'),
    mealSlot,
    plannedMealId: raw('plannedMealId'),
    mode,
    redirect: getSafeRedirectTarget(raw('redirect'), redirectFallback),
  };
}

export function isPlannedMealAdjustLogContext(query: PlannedMealLogQuery): boolean {
  return Boolean(query.plannedMealId && query.mode === PLANNED_MEAL_LOG_MODE);
}
