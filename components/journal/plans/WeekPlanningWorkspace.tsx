'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { EmbeddedDayPlanner } from '@/components/journal/plans/EmbeddedDayPlanner';
import { PlanContextModal } from '@/components/journal/plans/PlanContextModal';
import type { DayActionOutcome, CreateAndApplyResult } from '@/lib/plans/dayPlanActions';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  addDaysToDateKey,
  type DateRange,
} from '@/lib/plans/planDateRange';
import {
  datedDayTemplate,
  defaultWeekPlanName,
  loadWeekNameDraft,
  plannedMealCalories,
  saveWeekNameDraft,
  summarizeDayOccasions,
} from '@/lib/plans/weekWorkspace';
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
  dayDraftSeed: PlanDayTemplate | null;
  personId: string | null;
  weekPlans: PlanWeekPattern[];
  selectedWeekPlan: PlanWeekPattern | null;
  busy: boolean;
  error: string | null;
  message: string | null;
  onPreviousWeek: () => void;
  onThisWeek: () => void;
  onNextWeek: () => void;
  onAddDayPlan: (templateId: string, dateLocal: string) => Promise<DayActionOutcome>;
  onCreateAndApplyDayPlan: (
    draft: PlanDayTemplate,
    dateLocal: string,
    existingSavedTemplateId?: string | null,
  ) => Promise<CreateAndApplyResult>;
  onSaveDatedDay: (draft: PlanDayTemplate, dateLocal: string) => Promise<DayActionOutcome>;
  onSaveCurrentWeek: (name: string) => void | Promise<void>;
  onOpenWeekPlan: (plan: PlanWeekPattern) => void;
  onNewWeekPlan: (name: string) => void | Promise<void>;
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
  const [contextModal, setContextModal] = useState<{
    activeTab: 'library' | 'create-edit';
    boundDate: string | null;
  } | null>(null);
  const [weekLibraryQuery, setWeekLibraryQuery] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyDate, setApplyDate] = useState(props.selectedRange.start);
  const [weekPlanName, setWeekPlanName] = useState(
    props.selectedWeekPlan?.name ?? defaultWeekPlanName(props.selectedRange.start),
  );
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    const generated = defaultWeekPlanName(props.selectedRange.start);
    const restored =
      !props.selectedWeekPlan && props.personId && typeof window !== 'undefined'
        ? loadWeekNameDraft(window.localStorage, props.personId, props.selectedRange.start)
        : null;
    setWeekPlanName(props.selectedWeekPlan?.name ?? restored ?? generated);
  }, [props.personId, props.selectedRange.start, props.selectedWeekPlan]);

  useEffect(() => {
    if (!props.personId || typeof window === 'undefined') return;
    saveWeekNameDraft(
      window.localStorage,
      props.personId,
      props.selectedRange.start,
      weekPlanName,
    );
  }, [props.personId, props.selectedRange.start, weekPlanName]);

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
  const datedTemplateByDate = useMemo(() => {
    const result = new Map<string, PlanDayTemplate>();
    for (const day of props.planDays) {
      result.set(
        day.date_local,
        datedDayTemplate(
          day,
          slotsByDay.get(day.id) ?? [],
          mealsByDay.get(day.id) ?? [],
        ),
      );
    }
    return result;
  }, [mealsByDay, props.planDays, slotsByDay]);
  const plannedDayCount = calendarDates.filter((dateLocal) => {
    const day = dayByDate.get(dateLocal);
    return Boolean(day && (mealsByDay.get(day.id)?.length ?? 0) > 0);
  }).length;
  const matchingWeekPlans = props.weekPlans.filter((plan) =>
    plan.name.toLowerCase().includes(weekLibraryQuery.trim().toLowerCase()),
  );

  function chooseWeekPlan(plan: PlanWeekPattern) {
    props.onOpenWeekPlan(plan);
    setWeekPlanName(plan.name);
    setContextModal(null);
  }

  function datedTemplateFor(dateLocal: string): PlanDayTemplate | null {
    return datedTemplateByDate.get(dateLocal) ?? null;
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
              <Link role="menuitem" href={APP_ROUTES.plansMonth} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10">Month</Link>
            </div>
          </div>
        </div>
        <h1 className="mt-5 text-4xl font-light tracking-tight sm:text-5xl">
          Schedule your meals ahead
        </h1>
      </header>

      <section className="border-y border-white/15">
        <div className="flex flex-wrap items-center gap-2 py-3">
          <input
            aria-label="Week Plan name"
            value={weekPlanName}
            onChange={(event) => setWeekPlanName(event.target.value)}
            className="mr-auto min-w-0 basis-full border-0 bg-transparent px-2 py-2 text-base font-semibold outline-none focus:bg-white/[0.04] sm:basis-auto"
            placeholder={defaultWeekPlanName(props.selectedRange.start)}
          />
          <button
            type="button"
            onClick={() => {
              setWeekLibraryQuery('');
              setContextModal({ activeTab: 'library', boundDate: null });
            }}
            className={SMALL_BUTTON}
          >
            Open
          </button>
          <button type="button" onClick={() => void props.onNewWeekPlan(weekPlanName)} disabled={props.busy} className={SMALL_BUTTON}>New</button>
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
          const occasionSummaries = summarizeDayOccasions(daySlots, dayMeals);
          const occupiedSlotCount = occasionSummaries.length;
          const dayCalories = dayMeals.some((meal) => plannedMealCalories(meal) !== null)
            ? dayMeals.reduce((sum, meal) => sum + (plannedMealCalories(meal) ?? 0), 0)
            : null;
          const planned = dayMeals.length > 0;
          const expanded = expandedDates.has(dateLocal);
          return (
            <article
              key={dateLocal}
              data-testid="week-day-row"
              className="group border-b border-white/20 transition-colors hover:bg-black/35 focus-within:bg-black/35"
            >
              <div className="flex min-h-16 items-center gap-3 px-2 py-3 sm:px-3">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${planned ? 'bg-white/80' : 'border border-white/30'}`} />
                <button
                  type="button"
                  aria-expanded={planned ? expanded : undefined}
                  onClick={() => {
                    if (!planned) return;
                    setExpandedDates((current) => {
                      const next = new Set(current);
                      if (next.has(dateLocal)) next.delete(dateLocal);
                      else next.add(dateLocal);
                      return next;
                    });
                  }}
                  className="min-w-0 flex-1 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-white/40"
                >
                  <span className="block text-left text-sm font-semibold">{dayLabel(dateLocal)}</span>
                  <span className="mt-0.5 block text-[11px] text-white/45">
                    {planned
                      ? `${occupiedSlotCount || 1} of ${daySlots.length || occupiedSlotCount || 1} occasions planned`
                      : 'Unplanned'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContextModal({ activeTab: 'create-edit', boundDate: dateLocal });
                  }}
                  className="shrink-0 rounded-full border border-white/15 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  {planned ? 'Edit Day' : 'Add Day Plan'}
                </button>
                {planned ? (
                  <span aria-hidden className={`px-1 text-white/35 transition ${expanded ? 'rotate-90' : ''}`}>›</span>
                ) : null}
              </div>
              {planned && expanded ? (
                <div
                  data-testid={`occupied-day-summary-${dateLocal}`}
                  className="mx-2 mb-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:mx-3 sm:p-5"
                >
                  <div className="space-y-4">
                    {occasionSummaries.map((occasion) => (
                      <section key={occasion.slotId} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-white/55">
                            {occasion.label}
                          </h3>
                          <span className="text-xs text-white/45">
                            {occasion.calories === null ? '—' : Math.round(occasion.calories)} kcal
                          </span>
                        </div>
                        <ul className="space-y-2">
                          {occasion.meals.map((meal) => (
                            <li key={meal.id} className="rounded-xl bg-white/[0.04] px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/35">{meal.kind}</span>
                                  <p className="truncate text-sm font-medium">{meal.name}</p>
                                </div>
                                <span className="shrink-0 text-[11px] text-white/45">
                                  {meal.calories === null ? '—' : Math.round(meal.calories)} kcal
                                </span>
                              </div>
                              {meal.components.length > 0 ? (
                                <p className="mt-1 text-xs leading-5 text-white/50">{meal.components.join(' · ')}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs">
                    <p>
                      <span className="text-white/45">Total</span>{' '}
                      <span className="font-semibold">{dayCalories === null ? '—' : Math.round(dayCalories)} kcal</span>
                      <span className="mx-2 text-white/20">·</span>
                      <span className="text-white/45">NDS</span>{' '}
                      <span className="font-semibold">{day?.projected_nds_100 == null ? '—' : Math.round(day.projected_nds_100)}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setContextModal({ activeTab: 'create-edit', boundDate: dateLocal })}
                        className={SMALL_BUTTON}
                      >
                        Edit Day
                      </button>
                      <Link href={APP_ROUTE_BUILDERS.planDay(dateLocal)} className="px-2 py-2 text-white/45 hover:text-white">
                        Full Day
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-white/15 py-4">
        <button
          type="button"
          onClick={() => {
            setSaveName(weekPlanName);
            setSaveOpen(true);
          }}
          disabled={props.busy}
          className="rounded-full border border-white/40 px-6 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-35"
        >
          Save as Week Plan
        </button>
        <p className="text-xs text-white/55">{plannedDayCount} of 7 Days Planned</p>
      </section>

      {props.error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{props.error}</p> : null}
      {props.message ? <p className="mt-4 text-sm text-emerald-200">{props.message}</p> : null}

      {contextModal ? (
        <PlanContextModal
          title="Week Plans"
          titleId="week-context-modal-title"
          closeLabel="Close Week Plans"
          tablistLabel="Week planning tools"
          libraryTabLabel="Week Plans Library"
          createEditTabLabel="Create or Edit"
          activeTab={contextModal.activeTab}
          onTabChange={(activeTab) => setContextModal({ ...contextModal, activeTab })}
          onClose={() => setContextModal(null)}
          libraryPanel={
            <>
              <input type="search" value={weekLibraryQuery} onChange={(event) => setWeekLibraryQuery(event.target.value)} placeholder="Search Week Plans" className="w-full rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-[#d7ecff]/60" />
              <ul className="mt-5 divide-y divide-white/10">
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
            </>
          }
          createEditPanel={
            contextModal.boundDate && props.dayDraftSeed ? (
              <EmbeddedDayPlanner
                key={contextModal.boundDate}
                dateLocal={contextModal.boundDate}
                blankTemplate={props.dayDraftSeed}
                datedTemplate={datedTemplateFor(contextModal.boundDate)}
                templates={props.dayPlans}
                busy={props.busy}
                draftContext="week"
                onApplyReusable={props.onAddDayPlan}
                onCreateAndApply={props.onCreateAndApplyDayPlan}
                onSaveDated={props.onSaveDatedDay}
                onApplied={() => setContextModal(null)}
              />
            ) : (
              <div>
                <h3 className="text-lg font-semibold">Choose a day to create or edit</h3>
                <p className="mt-1 text-sm text-white/50">Select one of the seven dates in this week. Choosing a date does not change your plan.</p>
                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {calendarDates.map((dateLocal) => (
                    <button
                      key={dateLocal}
                      type="button"
                      onClick={() => setContextModal({ activeTab: 'create-edit', boundDate: dateLocal })}
                      className="rounded-2xl border border-white/10 px-4 py-3 text-left hover:bg-white/[0.06]"
                    >
                      <span className="block text-sm font-semibold">{dayLabel(dateLocal)}</span>
                      <span className="text-xs text-white/45">{fullDateLabel(dateLocal)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          }
        />
      ) : null}

      {saveOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="save-week-plan-title" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#29231d] p-6">
            <h2 id="save-week-plan-title" className="text-xl font-semibold">Save as Week Plan</h2>
            <p className="mt-2 text-sm text-white/55">Save an isolated reusable snapshot of this dated week.</p>
            <input aria-label="New Week Plan name" value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder={defaultWeekPlanName(props.selectedRange.start)} className="mt-5 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 outline-none" />
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
