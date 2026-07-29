'use client';

/**
 * Legacy Plans-owned grocery path, retained for developer convenience only.
 * Grocery shopping now lives canonically under the Food service. See
 * docs/design for the Food architecture packet rationale.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

export default function LegacyPlanGroceryRedirect() {
  const router = useRouter();
  const planId = typeof router.query.planId === 'string' ? router.query.planId : null;

  useEffect(() => {
    if (!router.isReady || !planId) return;
    const query = new URLSearchParams(
      Object.entries(router.query)
        .filter(([key]) => key !== 'planId')
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ).toString();
    const target = query
      ? `${APP_ROUTE_BUILDERS.planGrocery(planId)}?${query}`
      : APP_ROUTE_BUILDERS.planGrocery(planId);
    void router.replace(target);
  }, [router, router.isReady, planId, router.query]);

  return null;
}
