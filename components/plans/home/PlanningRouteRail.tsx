'use client';

import Link from 'next/link';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

const sublinkClass =
  'rounded-full px-2 py-1 text-[11px] text-white/55 transition-colors hover:bg-white/10 hover:text-white';

const LIBRARY_ITEMS = [
  { id: 'meals', label: 'Meals', href: APP_ROUTES.foodMeals },
  { id: 'day-plans', label: 'Day Plans', href: APP_ROUTES.plansDayTemplates },
  { id: 'week-plans', label: 'Week Plans', href: APP_ROUTES.plansWeekPatterns },
] as const;

export function PlanningRouteRail() {
  return (
    <nav
      aria-label="Planning routes"
      className="relative z-[1] border-y border-white/20 bg-[#463c2f]"
    >
      <div className="grid min-w-[46rem] grid-cols-[0.8fr_1.35fr_1.35fr] overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:min-w-0">
        <Link
          href={APP_ROUTES.plans}
          aria-current="page"
          className="flex items-center justify-center bg-[#3f362b] px-4 py-4 text-sm font-semibold text-white"
        >
          Home
        </Link>
        <div className="border-l border-white/15 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-white/80">Manage</p>
          <div className="mt-1 flex items-center justify-center gap-1">
            <Link href={APP_ROUTES.todayPlan} className={sublinkClass}>Day</Link>
            <Link href={APP_ROUTES.plansWeek} className={sublinkClass}>Week</Link>
            <span
              aria-disabled="true"
              title="Month planning is not available yet"
              className="rounded-full px-2 py-1 text-[11px] text-white/25"
            >
              Month
            </span>
          </div>
        </div>
        <div className="border-l border-white/15 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-white/80">Library</p>
          <div className="mt-1 flex items-center justify-center gap-1">
            {LIBRARY_ITEMS.map((item) => (
              <Link key={item.id} href={item.href} className={sublinkClass}>{item.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
