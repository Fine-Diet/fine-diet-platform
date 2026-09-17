'use client';

import Link from 'next/link';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

const hiddenScrollbarClassName =
  'overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const manageCellClass =
  'flex shrink-0 items-center justify-center self-stretch border-r border-white/20 bg-brand-800 px-4 text-center text-xs font-semibold text-white antialiased';

const routeCellClassBase =
  'flex min-h-10 min-w-[5.5rem] flex-1 items-center justify-center self-stretch border-l border-white/20 px-4 text-center text-sm font-normal antialiased sm:min-w-0';

export type PlanningRouteSelection = 'day' | 'week' | 'month';

interface PlanningRouteRailProps {
  selected?: PlanningRouteSelection;
}

function routeCellClass(selected: boolean, isLast = false): string {
  return `${routeCellClassBase} transition-colors ${
    isLast ? 'border-r border-white/20 ' : ''
  }${
    selected
      ? 'bg-white/10 font-semibold text-white'
      : 'bg-transparent text-white hover:bg-white/5 hover:text-white'
  }`;
}

export function PlanningRouteRail({
  selected,
}: PlanningRouteRailProps) {
  return (
    <nav
      aria-label="Planning routes"
      className="relative z-[1] border-y border-white/20"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_min(100%,950px)_minmax(0,1fr)]">
        <div className="bg-brand-800" aria-hidden="true" />
        <div className="flex w-full max-w-[950px] items-stretch bg-[#463c2f]">
          <span className={manageCellClass}>Manage</span>
          <div className={`flex min-w-0 flex-1 items-stretch ${hiddenScrollbarClassName}`} data-plans-route-strip>
            <div className="flex w-max min-w-full flex-nowrap items-stretch sm:w-full">
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
                className={routeCellClass(selected === 'month', true)}
              >
                Month
              </Link>
            </div>
          </div>
        </div>
        <div className="bg-[#463c2f]" aria-hidden="true" />
      </div>
    </nav>
  );
}
