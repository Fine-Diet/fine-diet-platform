'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  addDaysToDateKey,
  type DateRange,
} from '@/lib/plans/planDateRange';
import type {
  PlanDay,
  PlanDayTemplate,
  PlanSlot,
  PlannedMeal,
  PlanWeekPattern,
} from '@/lib/plans';

export interface WeekPlanningWorkspaceProps {
  loadState: 'loading' | 'ready' | 'error';
  selectedRange: DateRange;
  isCurrentWeek: boolean;
  planDays: PlanDay[];
  planSlots: PlanSlot[];
  meals: PlannedMeal[];
  dayPlans: PlanDayTemplate[];
  weekPlans: PlanWeekPattern[];
  selectedWeekPlan: PlanWeekPattern | null;
  busy: boolean;
  error: string | null;
  message: string | null;
  onPreviousWeek: () => void;
  onThisWeek: () => void;
  onNextWeek: () => void;
  onAddDayPlan: (templateId: string, dateLocal: string) => void | Promise<void>;
  onSaveCurrentWeek: (name: string) => void | Promise<void>;
  onOpenWeekPlan: (plan: PlanWeekPattern) => void;
  onNewWeekPlan: () => void | Promise<void>;
  onRenameWeekPlan: (name: string) => void | Promise<void>;
  onCopyWeekPlan: () => void | Promise<void>;
  onApplyWeekPlan: (dateLocal: string) => void | Promise<void>;
}

function parseDateKey(dateLocal: string): Date {
  const [year, month, day] = dateLocal.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function dayLabel(dateLocal: string): string {
  return parseDateKey(dateLocal).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
  });
}

function fullDateLabel(dateLocal: string): string {
  return parseDateKey(dateLocal).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function weekLabel(range: DateRange): string {
  const start = parseDateKey(range.start);
  const end = parseDateKey(range.end);
  const sameMonth = start.getMonth() === end.getMonth();
  const startText = start.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  const endText = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startText} – ${endText}`;
}

export function getSevenCalendarDates(range: DateRange): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(range.start, index));
}

const SMALL_BUTTON =
  'rounded-full border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35';

export function WeekPlanningWorkspace(props: WeekPlanningWorkspaceProps) {
  const [viewOpen, setViewOpen] = useState(false);
  const [dayLibraryDate, setDayLibraryDate] = useState<string | null>(null);
  const [dayLibraryQuery, setDayLibraryQuery] = useState('');
  const [selectedDayPlanId, setSelectedDayPlanId] = useState('');
  const [weekLibraryOpen, setWeekLibraryOpen] = useState(false);
  const [weekLibraryQuery, setWeekLibraryQuery] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('Unnamed Week Plan');
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyDate, setApplyDate] = useState(props.selectedRange.start);
  const [weekPlanName, setWeekPlanName] = useState(props.selectedWeekPlan?.name ?? '');

  useEffect(() => {
    setWeekPlanName(props.selectedWeekPlan?.name ?? '');
  }, [props.selectedWeekPlan]);

  useEffect(() => {
    setApplyDate(props.selectedRange.start);
  }, [props.selectedRange.start]);

  const calendarDates = useMemo(
    () => getSevenCalendarDates(props.selectedRange),
    [props.selectedRange],
  );
  const dayByDate = useMemo(
    () => new Map(props.planDays.map((day) => [day.date_local, day])),
    [props.planDays],
  );
  const slotsByDay = useMemo(() => {
    const result = new Map<string, PlanSlot[]>();
    for (const slot of props.planSlots) {
      result.set(slot.plan_day_id, [...(result.get(slot.plan_day_id) ?? []), slot]);
    }
    return result;
  }, [props.planSlots]);
  const mealsByDay = useMemo(() => {
    const result = new Map<string, PlannedMeal[]>();
    for (const meal of props.meals) {
      result.set(meal.plan_day_id, [...(result.get(meal.plan_day_id) ?? []), meal]);
    }
    return result;
  }, [props.meals]);
  const plannedDayCount = calendarDates.filter((dateLocal) => {
    const day = dayByDate.get(dateLocal);
    return Boolean(day && (mealsByDay.get(day.id)?.length ?? 0) > 0);
  }).length;
  const matchingDayPlans = props.dayPlans.filter((plan) =>
    plan.name.toLowerCase().includes(dayLibraryQuery.trim().toLowerCase()),
  );
  const matchingWeekPlans = props.weekPlans.filter((plan) =>
    plan.name.toLowerCase().includes(weekLibraryQuery.trim().toLowerCase()),
  );

  function chooseWeekPlan(plan: PlanWeekPattern) {
    props.onOpenWeekPlan(plan);
    setWeekPlanName(plan.name);
    setWeekLibraryOpen(false);
  }

  if (props.loadState === 'loading') {
    return <p className="py-16 text-sm text-white/55">Preparing your week…</p>;
  }

  if (props.loadState === 'error') {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
        We could not load this week. Refresh to try again.
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
              Week <span aria-hidden>⌄</span>
            </button>
            <div
              role="menu"
              aria-label="Plans view"
              className={`${viewOpen ? 'visible opacity-100' : 'invisible opacity-0'} absolute left-0 top-7 z-30 min-w-36 rounded-xl border border-white/15 bg-[#29231d] p-1 shadow-2xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100`}
            >
              <Link role="menuitem" href={APP_ROUTES.plansDay} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10">Day</Link>
              <Link role="menuitem" aria-current="page" href={APP_ROUTES.plansWeek} className="block rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15 focus:bg-white/15">Week</Link>
              <span role="menuitem" aria-disabled="true" className="block rounded-lg px-3 py-2 text-sm text-white/35">Month</span>
            </div>
          </div>
        </div>
        <h1 className="mt-5 text-4xl font-light tracking-tight sm:text-5xl">
          Schedule your meals ahead
        </h1>
      </header>

      <section className="border-y border-white/15">
        <div className="flex flex-wrap items-center gap-2 py-3">
          {props.selectedWeekPlan ? (
            <input
              aria-label="Week Plan name"
              value={weekPlanName}
              onChange={(event) => setWeekPlanName(event.target.value)}
              className="mr-auto min-w-48 flex-1 border-0 bg-transparent px-2 py-2 text-base font-semibold outline-none focus:bg-white/[0.04]"
              placeholder="Unnamed Week Plan"
            />
          ) : (
            <p className="mr-auto px-2 text-base font-semibold">Week of {fullDateLabel(props.selectedRange.start)}</p>
          )}
          <button type="button" onClick={() => setWeekLibraryOpen(true)} className={SMALL_BUTTON}>Open</button>
          <button type="button" onClick={() => void props.onNewWeekPlan()} disabled={props.busy} className={SMALL_BUTTON}>New</button>
          {props.selectedWeekPlan ? (
            <>
              <button type="button" onClick={() => void props.onCopyWeekPlan()} disabled={props.busy} className={SMALL_BUTTON}>Make a copy</button>
              <button type="button" onClick={() => setApplyOpen(true)} disabled={props.busy} className={SMALL_BUTTON}>Apply to week</button>
              <button
                type="button"
                onClick={() => void props.onRenameWeekPlan(weekPlanName)}
                disabled={props.busy || weekPlanName.trim() === props.selectedWeekPlan.name}
                className={SMALL_BUTTON}
              >
                Save
              </button>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-3">
          <p className="text-sm text-white/65">{weekLabel(props.selectedRange)}</p>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous week" onClick={props.onPreviousWeek} className={SMALL_BUTTON}>←</button>
            <button type="button" onClick={props.onThisWeek} disabled={props.isCurrentWeek} className={SMALL_BUTTON}>This week</button>
            <button type="button" aria-label="Next week" onClick={props.onNextWeek} className={SMALL_BUTTON}>→</button>
          </div>
        </div>
      </section>

      <section aria-label="Selected week" className="mt-2">
        {calendarDates.map((dateLocal) => {
          const day = dayByDate.get(dateLocal);
          const dayMeals = day ? mealsByDay.get(day.id) ?? [] : [];
          const daySlots = day ? slotsByDay.get(day.id) ?? [] : [];
          const occupiedSlotCount = new Set(
            dayMeals.map((meal) => meal.plan_slot_id).filter(Boolean),
          ).size;
          const planned = dayMeals.length > 0;
          return (
            <article
              key={dateLocal}
              data-testid="week-day-row"
              className="group border-b border-white/20 transition-colors hover:bg-black/35 focus-within:bg-black/35"
            >
              <div className="flex min-h-16 items-center gap-3 px-2 py-3 sm:px-3">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${planned ? 'bg-white/80' : 'border border-white/30'}`} />
                <Link
                  href={APP_ROUTE_BUILDERS.planDay(dateLocal)}
                  className="min-w-0 flex-1 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-white/40"
                >
                  <span className="block text-sm font-semibold">{dayLabel(dateLocal)}</span>
                  <span className="mt-0.5 block text-[11px] text-white/45">
                    {planned
                      ? `${occupiedSlotCount || 1} of ${daySlots.length || occupiedSlotCount || 1} occasions planned`
                      : 'Unplanned'}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDayLibraryDate(dateLocal);
                    setDayLibraryQuery('');
                    setSelectedDayPlanId('');
                  }}
                  className="shrink-0 rounded-full border border-white/15 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  Add Day Plan
                </button>
                <Link aria-label={`Open ${dateLocal}`} href={APP_ROUTE_BUILDERS.planDay(dateLocal)} className="px-1 text-white/35">›</Link>
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-white/15 py-4">
        <button type="button" onClick={() => setSaveOpen(true)} disabled={props.busy} className="rounded-full border border-white/40 px-6 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-35">
          Save as Week Plan
        </button>
        <p className="text-xs text-white/55">{plannedDayCount} of 7 Days Planned</p>
      </section>

      {props.error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{props.error}</p> : null}
      {props.message ? <p className="mt-4 text-sm text-emerald-200">{props.message}</p> : null}

      {dayLibraryDate ? (
        <div role="dialog" aria-modal="true" aria-labelledby="day-plan-picker-title" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 sm:p-6">
          <section className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 bg-[#29231d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
              <div>
                <h2 id="day-plan-picker-title" className="text-xl font-semibold">Day Plans Library</h2>
                <p className="mt-1 text-xs text-white/45">Choose a reusable Day Plan for {fullDateLabel(dayLibraryDate)}.</p>
              </div>
              <button type="button" aria-label="Close Day Plans Library" onClick={() => setDayLibraryDate(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">×</button>
            </div>
            <div className="p-5 sm:p-7">
              <input type="search" value={dayLibraryQuery} onChange={(event) => setDayLibraryQuery(event.target.value)} placeholder="Search Day Plans" className="w-full rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-[#d7ecff]/60" />
              <ul className="mt-4 max-h-[45vh] divide-y divide-white/10 overflow-y-auto">
                {matchingDayPlans.map((plan) => (
                  <li key={plan.id}>
                    <button type="button" aria-pressed={selectedDayPlanId === plan.id} onClick={() => setSelectedDayPlanId(plan.id)} className={`flex w-full items-center justify-between px-2 py-4 text-left hover:bg-white/[0.04] ${selectedDayPlanId === plan.id ? 'bg-white/[0.08]' : ''}`}>
                      <span><span className="block font-medium">{plan.name}</span><span className="mt-1 block text-xs text-white/45">{plan.slots.length} occasions</span></span>
                      <span aria-hidden>{selectedDayPlanId === plan.id ? '✓' : '›'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {matchingDayPlans.length === 0 ? <p className="py-10 text-center text-sm text-white/45">No matching Day Plans.</p> : null}
              <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
                <button type="button" onClick={() => setDayLibraryDate(null)} className="rounded-full px-4 py-2 text-sm text-white/60 hover:bg-white/10">Cancel</button>
                <button
                  type="button"
                  disabled={!selectedDayPlanId || props.busy}
                  onClick={async () => {
                    try {
                      await props.onAddDayPlan(selectedDayPlanId, dayLibraryDate);
                      setDayLibraryDate(null);
                    } catch {
                      // Parent owns surfaced error copy; keep the picker open.
                    }
                  }}
                  className="rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black disabled:opacity-40"
                >
                  {props.busy ? 'Applying…' : 'Apply Day Plan'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {weekLibraryOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="week-plan-library-title" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 sm:p-6">
          <section className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 bg-[#29231d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
              <h2 id="week-plan-library-title" className="text-xl font-semibold">Week Plans Library</h2>
              <button type="button" aria-label="Close Week Plans Library" onClick={() => setWeekLibraryOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">×</button>
            </div>
            <div className="p-5 sm:p-7">
              <input type="search" value={weekLibraryQuery} onChange={(event) => setWeekLibraryQuery(event.target.value)} placeholder="Search Week Plans" className="w-full rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-[#d7ecff]/60" />
              <ul className="mt-5 max-h-[55vh] divide-y divide-white/10 overflow-y-auto">
                {matchingWeekPlans.map((plan) => (
                  <li key={plan.id}>
                    <button type="button" onClick={() => chooseWeekPlan(plan)} className="flex w-full items-center justify-between gap-4 px-2 py-4 text-left hover:bg-white/[0.04]">
                      <span><span className="block font-medium">{plan.name}</span><span className="mt-1 block text-xs text-white/45">{plan.days.length} days</span></span>
                      <span aria-hidden className="text-white/35">→</span>
                    </button>
                  </li>
                ))}
              </ul>
              {matchingWeekPlans.length === 0 ? <p className="py-10 text-center text-sm text-white/45">No matching Week Plans.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {saveOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="save-week-plan-title" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#29231d] p-6">
            <h2 id="save-week-plan-title" className="text-xl font-semibold">Save as Week Plan</h2>
            <p className="mt-2 text-sm text-white/55">Save an isolated reusable snapshot of this dated week.</p>
            <input aria-label="New Week Plan name" value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Unnamed Week Plan" className="mt-5 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 outline-none" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSaveOpen(false)} className="rounded-full px-4 py-2 text-sm text-white/60 hover:bg-white/10">Cancel</button>
              <button
                type="button"
                disabled={props.busy}
                onClick={async () => {
                  try {
                    await props.onSaveCurrentWeek(saveName);
                    setSaveOpen(false);
                  } catch {
                    // Parent owns surfaced error copy; keep the dialog open.
                  }
                }}
                className="rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black disabled:opacity-40"
              >
                {props.busy ? 'Saving…' : 'Save Week Plan'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {applyOpen && props.selectedWeekPlan ? (
        <div role="dialog" aria-modal="true" aria-labelledby="apply-week-plan-title" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#29231d] p-6">
            <h2 id="apply-week-plan-title" className="text-xl font-semibold">{props.selectedWeekPlan.name}</h2>
            <p className="mt-2 text-sm text-white/55">Choose new week</p>
            <input type="date" aria-label="Choose new week" value={applyDate} onChange={(event) => setApplyDate(event.target.value)} className="mt-5 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 [color-scheme:dark]" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setApplyOpen(false)} className="rounded-full px-4 py-2 text-sm text-white/60 hover:bg-white/10">Cancel</button>
              <button
                type="button"
                disabled={!applyDate || props.busy}
                onClick={async () => {
                  try {
                    await props.onApplyWeekPlan(applyDate);
                    setApplyOpen(false);
                  } catch {
                    // Parent owns surfaced error copy; keep the dialog open.
                  }
                }}
                className="rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black disabled:opacity-40"
              >
                {props.busy ? 'Applying…' : 'Apply to week'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
