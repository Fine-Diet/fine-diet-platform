'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import type { PlanDay, PlanSlot, PlannedMeal } from '@/lib/plans';
import {
  formatCalendarMonth,
  projectMonthPlanningState,
} from '@/lib/plans/monthProjection';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CONTROL =
  'grid min-h-11 min-w-11 place-items-center rounded-full border border-white/20 px-3 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35';

export interface MonthCalendarProjectionProps {
  loadState: 'loading' | 'ready' | 'error';
  monthKey: string;
  visibleDates: string[];
  planDays: PlanDay[];
  planSlots: PlanSlot[];
  meals: PlannedMeal[];
  isCurrentMonth: boolean;
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
}

export function MonthCalendarProjection(props: MonthCalendarProjectionProps) {
  const [viewOpen, setViewOpen] = useState(false);
  const today = todayLocalDateKey();
  const projection = useMemo(
    () =>
      projectMonthPlanningState(
        props.visibleDates,
        props.planDays,
        props.planSlots,
        props.meals,
      ),
    [props.meals, props.planDays, props.planSlots, props.visibleDates],
  );

  if (props.loadState === 'loading') {
    return <p className="py-16 text-sm text-white/55">Preparing your month…</p>;
  }

  if (props.loadState === 'error') {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
        We could not load this month. Refresh to try again.
      </div>
    );
  }

  return (
    <>
      <header className="mb-8">
        <div className="flex items-start gap-2 text-sm font-semibold text-white/80">
          <Link href={APP_ROUTES.plans}>Plans</Link>
          <span className="text-white/30">›</span>
          <div className="group relative focus-within:z-30">
            <button
              type="button"
              aria-haspopup="menu"
              aria-current="page"
              aria-expanded={viewOpen}
              onClick={() => setViewOpen((open) => !open)}
              className="rounded-md px-1 hover:bg-white/10 focus:bg-white/10 focus:outline-none"
            >
              Month <span aria-hidden>⌄</span>
            </button>
            <div
              role="menu"
              aria-label="Plans view"
              className={`${viewOpen ? 'visible opacity-100' : 'invisible opacity-0'} absolute left-0 top-7 z-30 min-w-36 rounded-xl border border-white/15 bg-[#29231d] p-1 shadow-2xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100`}
            >
              <Link role="menuitem" href={APP_ROUTES.plansDay} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10">Day</Link>
              <Link role="menuitem" href={APP_ROUTES.plansWeek} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10">Week</Link>
              <Link role="menuitem" aria-current="page" href={APP_ROUTES.plansMonth} className="block rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15 focus:bg-white/15">Month</Link>
            </div>
          </div>
        </div>
        <h1 className="mt-5 max-w-xl text-4xl font-light tracking-tight sm:text-5xl">
          Schedule your meals ahead
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/55">
          See where meals are planned, then open any date to continue planning.
        </p>
      </header>

      <section aria-label="Month navigation" className="border-y border-white/15 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{formatCalendarMonth(props.monthKey)}</h2>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous month" onClick={props.onPreviousMonth} className={CONTROL}>←</button>
            <button type="button" onClick={props.onCurrentMonth} disabled={props.isCurrentMonth} className={CONTROL}>This month</button>
            <button type="button" aria-label="Next month" onClick={props.onNextMonth} className={CONTROL}>→</button>
          </div>
        </div>
      </section>

      <section aria-label={`${formatCalendarMonth(props.monthKey)} calendar`} className="mt-5">
        <div className="grid grid-cols-7 text-center text-[10px] font-medium text-white/50 sm:text-xs">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-2">{weekday}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-white/25 bg-black/10">
          {projection.map((day) => {
            const inSelectedMonth = day.dateLocal.startsWith(`${props.monthKey}-`);
            const isToday = day.dateLocal === today;
            const dateNumber = Number(day.dateLocal.slice(-2));
            const stateText = day.planned
              ? day.occupiedOccasionCount > 0
                ? `${day.occupiedOccasionCount} occasion${day.occupiedOccasionCount === 1 ? '' : 's'} planned`
                : 'Planning exists'
              : day.hasDatedDay
                ? 'Dated day is empty'
                : 'Unplanned';

            return (
              <Link
                key={day.dateLocal}
                data-testid="month-day-cell"
                data-date={day.dateLocal}
                data-in-month={inSelectedMonth ? 'true' : 'false'}
                data-planned={day.planned ? 'true' : 'false'}
                href={APP_ROUTE_BUILDERS.planDay(day.dateLocal)}
                aria-label={`${day.dateLocal}: ${stateText}`}
                className={`relative flex min-h-16 min-w-0 flex-col items-center justify-between border-b border-r border-white/20 px-1 py-2 text-center transition hover:bg-white/10 focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/60 sm:min-h-24 sm:items-start sm:px-3 sm:py-3 sm:text-left ${
                  day.planned ? 'bg-white/[0.09]' : ''
                } ${inSelectedMonth ? 'text-white/75' : 'bg-black/10 text-white/25'} ${
                  isToday ? 'ring-1 ring-inset ring-[#d7ecff]' : ''
                }`}
              >
                <span className={`text-xs sm:text-sm ${isToday ? 'font-bold text-[#d7ecff]' : ''}`}>
                  {dateNumber}
                </span>
                {day.planned ? (
                  <span className="mb-1 flex items-center gap-1 text-[9px] font-medium text-white/70 sm:text-[10px]">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#d7ecff]" />
                    <span className="hidden sm:inline">
                      {day.occupiedOccasionCount || 'Plan'}
                    </span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-white/45">
          A filled marker means the date contains planned meals. Select any date to open Day planning.
        </p>
      </section>
    </>
  );
}
