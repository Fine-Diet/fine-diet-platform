'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { planService } from '@/lib/plans';
import {
  getCalendarWeekRange,
  resolvePlanDayNavigation,
  todayLocalDateKey,
} from '@/lib/plans/planDateRange';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

/**
 * Resolves Today's Plan dynamically:
 * - active plan + today's plan_day row → dated day editor
 * - active plan + no today row → weekly planner with generate affordance
 * - no active plan → plans overview
 */
export default function JournalPlansTodayPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const plans = await planService.list();
        const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
        if (!active) {
          if (!cancelled) await router.replace(APP_ROUTES.plans);
          return;
        }

        const detail = await planService.getDetail(active.id);
        const resolved = resolvePlanDayNavigation({
          plan: active,
          days: detail.days,
          dateKey: todayLocalDateKey(),
          selectedRange: getCalendarWeekRange(),
        });

        if (!cancelled) await router.replace(resolved.href);
      } catch (err) {
        console.warn('[PlansToday] Failed to resolve today plan route:', err);
        if (!cancelled) await router.replace(APP_ROUTES.plans);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#16110d] text-sm text-white/60 antialiased">
      Opening today&apos;s plan…
    </div>
  );
}
