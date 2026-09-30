/**
 * Strict canonical app paths where an accepted Haul contributor may enter
 * without journal entitlement (middleware exception only).
 */

import { APP_ROUTES } from '@/lib/routes/appRoutes';

const HAUL_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StrictContributorHaulAppRoute {
  haulId: string;
}

/**
 * Matches ONLY:
 *   /app/food/hauls/:haulId
 *   /app/food/hauls/:haulId/shop
 *
 * Rejects the haul library, non-UUID ids, and any extra path segments.
 */
export function parseStrictContributorHaulAppPath(
  pathname: string,
): StrictContributorHaulAppRoute | null {
  const path = pathname.split('?')[0].split('#')[0];
  const base = APP_ROUTES.foodHauls;

  if (path === base || path === `${base}/`) {
    return null;
  }
  const prefix = `${base}/`;
  if (!path.startsWith(prefix)) {
    return null;
  }

  const suffix = path.slice(prefix.length);
  const segments = suffix.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const haulId = segments[0];
  if (!HAUL_ID_RE.test(haulId)) {
    return null;
  }

  if (segments.length === 1) {
    return { haulId };
  }
  if (segments.length === 2 && segments[1] === 'shop') {
    return { haulId };
  }

  return null;
}
