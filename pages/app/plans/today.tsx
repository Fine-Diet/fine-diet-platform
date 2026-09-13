'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';

import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

/**
 * Compatibility route for older Plans links.
 *
 * Manage > Day now has one canonical presentation: the date-addressed Day
 * workspace. Plan resolution remains read-only on that destination.
 */
export default function PlanTodayCompatibilityPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    void router.replace(APP_ROUTE_BUILDERS.planDay(todayLocalDateKey()));
  }, [router]);

  return (
    <div className="grid min-h-screen place-items-center bg-brand-900 px-6 text-white">
      <p className="text-sm text-white/55 antialiased">Opening today&apos;s plan…</p>
    </div>
  );
}
