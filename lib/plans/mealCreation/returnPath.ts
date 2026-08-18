/**
 * Strict create-meal returnTo allowlist. Exact in-app paths only.
 * No query strings, trailing slashes, or arbitrary URLs.
 */

import { APP_ROUTES } from '@/lib/routes/appRoutes';

export const PLAN_TODAY_RETURN_PATH = APP_ROUTES.todayPlan;
export const PLAN_WEEK_RETURN_PATH = APP_ROUTES.plansWeek;

const SAFE_CREATE_MEAL_RETURN_PATHS = new Set<string>([
  PLAN_TODAY_RETURN_PATH,
  PLAN_WEEK_RETURN_PATH,
]);

export function isSafeAppReturnPath(value: string): boolean {
  return SAFE_CREATE_MEAL_RETURN_PATHS.has(value);
}

export function canonicalCreateMealReturnTo(value: string | null | undefined): string | null {
  if (value && isSafeAppReturnPath(value)) return value;
  return null;
}
