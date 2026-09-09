'use client';

import Link from 'next/link';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

const cellClass =
  'flex min-h-10 items-center justify-center px-4 py-3 text-center text-xs antialiased sm:text-sm';

export function PlanningRouteRail() {
  return (
    <nav
      aria-label="Planning routes"
      className="relative z-[1] border-y border-white/20 bg-[#463c2f]"
    >
      <div className="grid grid-cols-4">
        <span className={`${cellClass} font-semibold text-white`}>
          Manage
        </span>
        <Link
          href={APP_ROUTES.todayPlan}
          className={`${cellClass} border-l border-white/15 text-white/70 transition-colors hover:bg-white/5 hover:text-white`}
        >
          Day
        </Link>
        <Link
          href={APP_ROUTES.plansWeek}
          className={`${cellClass} border-l border-white/15 text-white/70 transition-colors hover:bg-white/5 hover:text-white`}
        >
          Week
        </Link>
        <span
          aria-disabled="true"
          title="Month planning is not available yet"
          className={`${cellClass} border-l border-white/15 text-white/30`}
        >
          Month
        </span>
      </div>
    </nav>
  );
}
