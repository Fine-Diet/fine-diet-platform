'use client';

import Link from 'next/link';

import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

const cellClass =
  'flex min-h-10 items-center justify-center px-4 py-3 text-center text-xs antialiased sm:text-sm';

export type PlanningRouteSelection = 'day' | 'week' | 'month';

interface PlanningRouteRailProps {
  selected?: PlanningRouteSelection;
  dayDate?: string;
}

function routeCellClass(selected: boolean): string {
  return `${cellClass} border-l border-white/15 transition-colors ${
    selected
      ? 'bg-white/10 font-semibold text-white'
      : 'text-white/70 hover:bg-white/5 hover:text-white'
  }`;
}

export function PlanningRouteRail({
  selected,
  dayDate = todayLocalDateKey(),
}: PlanningRouteRailProps) {
  return (
    <nav
      aria-label="Planning routes"
      className="relative z-[1] border-y border-white/20 bg-[#463c2f]"
    >
      <div className="grid grid-cols-4">
        <span className={`${cellClass} ${selected ? 'text-white/70' : 'font-semibold text-white'}`}>
          Manage
        </span>
        <Link
          href={APP_ROUTE_BUILDERS.planDay(dayDate)}
          aria-current={selected === 'day' ? 'page' : undefined}
          className={routeCellClass(selected === 'day')}
        >
          Day
        </Link>
        <Link
          href={APP_ROUTES.plansWeek}
          aria-current={selected === 'week' ? 'page' : undefined}
          className={routeCellClass(selected === 'week')}
        >
          Week
        </Link>
        <Link
          href={APP_ROUTES.plansMonth}
          aria-current={selected === 'month' ? 'page' : undefined}
          className={routeCellClass(selected === 'month')}
        >
          Month
        </Link>
      </div>
    </nav>
  );
}
