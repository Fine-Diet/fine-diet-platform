'use client';

/**
 * Legacy flat path, retained for developer convenience only. Meals &
 * Recipes now lives canonically under the Food service. See docs/design
 * for the Food architecture packet rationale.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

export default function LegacyMealsRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const query = new URLSearchParams(
      Object.entries(router.query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ).toString();
    const target = query ? `${APP_ROUTES.foodMeals}?${query}` : APP_ROUTES.foodMeals;
    void router.replace(target);
  }, [router, router.isReady, router.query]);

  return null;
}
