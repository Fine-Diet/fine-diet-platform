'use client';

import Link from 'next/link';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

const manageCellClass =
  'flex min-h-10 items-center justify-center bg-brand-800 px-4 py-4 text-center text-xs antialiased';

const routeCellClassBase =
  'flex min-h-10 items-center justify-center px-4 py-3 text-center text-sm font-normal antialiased bg-transparent';

export type PlanningRouteSelection = 'day' | 'week' | 'month';

interface PlanningRouteRailProps {
  selected?: PlanningRouteSelection;
}

function routeCellClass(selected: boolean): string {
  return `${routeCellClassBase} border-l border-white/15 transition-colors ${
    selected
      ? 'bg-white/10 font-semibold text-white'
      : 'text-white hover:bg-white/5 hover:text-white'
  }`;
}

export function PlanningRouteRail({
  selected,
}: PlanningRouteRailProps) {
  return (
    <nav
      aria-label="Planning routes"
      className="relative z-[1] border-y border-white/20 bg-[#463c2f]"
    >
      <div className="grid grid-cols-4">
        <span className={`${manageCellClass} ${selected ? 'text-white/75' : 'font-semibold text-white'}`}>
          Manage
        </span>
        <Link
          href={APP_ROUTES.plansDay}
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
