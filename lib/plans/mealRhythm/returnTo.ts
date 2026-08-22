/**
 * Meal Rhythm v2B — safe returnTo helper.
 *
 * Only allows navigation back to a known canonical APP_ROUTES path
 * (or subtree). Rejects external URLs, protocol-relative URLs, and
 * anything not on the canonical /app prefix.
 *
 * `/app/plans/rhythm` is never returned as returnTo (self-return after Done
 * would remount confirmation). It coerces to the fallback instead.
 */

import { APP_ROUTES } from '@/lib/routes/appRoutes';

const ALLOWED_PATHS: readonly string[] = [
  APP_ROUTES.home,
  APP_ROUTES.plans,
  APP_ROUTES.todayPlan,
  APP_ROUTES.plansWeek,
  APP_ROUTES.profile,
  APP_ROUTES.programs,
  APP_ROUTES.log,
];

function pathOnly(raw: string): string {
  return raw.split('?')[0].split('#')[0];
}

function isAllowedPath(raw: string): boolean {
  const path = pathOnly(raw);

  for (const allowed of ALLOWED_PATHS) {
    if (path === allowed) return true;
  }

  // Allow food/* subtrees
  if (path === APP_ROUTES.food || path.startsWith(`${APP_ROUTES.food}/`)) {
    return true;
  }

  return false;
}

function isSafeReturnTo(raw: string): boolean {
  if (!raw) return false;

  // Reject protocol-relative and absolute URLs
  if (raw.startsWith('//') || raw.includes('://')) return false;

  // Must start with /
  if (!raw.startsWith('/')) return false;

  // Self-return to the rhythm route is never useful after Done
  if (pathOnly(raw) === APP_ROUTES.plansRhythm) return false;

  return isAllowedPath(raw);
}

/**
 * Resolve a safe returnTo path.
 *
 * If `raw` is a safe canonical app path, return it.
 * Otherwise fall back to `fallback` (which must be a known safe value).
 */
export function resolveSafeMealRhythmReturnTo(
  raw: string | null | undefined,
  fallback: string = APP_ROUTES.plans,
): string {
  if (raw && isSafeReturnTo(raw)) return raw;
  // Never allow fallback to leave the user on the rhythm route itself
  if (pathOnly(fallback) === APP_ROUTES.plansRhythm) return APP_ROUTES.plans;
  return fallback;
}
