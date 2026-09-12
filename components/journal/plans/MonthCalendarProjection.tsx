'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { EmbeddedDayPlanner } from '@/components/journal/plans/EmbeddedDayPlanner';
import { PlanContextModal } from '@/components/journal/plans/PlanContextModal';
import type { CreateAndApplyResult, DayActionOutcome } from '@/lib/plans/dayPlanActions';
import type { PlanDay, PlanDayTemplate, PlanSlot, PlannedMeal } from '@/lib/plans';
import {
  formatCalendarMonth,
  projectMonthPlanningState,
} from '@/lib/plans/monthProjection';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { datedDayTemplate } from '@/lib/plans/weekWorkspace';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CONTROL =
  'grid min-h-11 min-w-11 place-items-center rounded-full border border-white/20 px-3 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35';
const SMALL_BUTTON =
  'rounded-full border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35';

function parseDateKey(dateLocal: string): Date {
  const [year, month, day] = dateLocal.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function fullDateLabel(dateLocal: string): string {
  return parseDateKey(dateLocal).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface MonthCalendarProjectionProps {
  loadState: 'loading' | 'ready' | 'error';
  monthKey: string;
  visibleDates: string[];
  planDays: PlanDay[];
  planSlots: PlanSlot[];
  meals: PlannedMeal[];
  dayPlans: PlanDayTemplate[];
  dayDraftSeed: PlanDayTemplate | null;
  blankTemplateForDate: (dateLocal: string) => PlanDayTemplate | null;
  busy: boolean;
  modalError: string | null;
  isCurrentMonth: boolean;
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
  onApplyReusable: (templateId: string, dateLocal: string) => Promise<DayActionOutcome>;
  onCreateAndApply: (
    draft: PlanDayTemplate,
    dateLocal: string,
    existingSavedTemplateId?: string | null,
  ) => Promise<CreateAndApplyResult>;
  onSaveDated: (draft: PlanDayTemplate, dateLocal: string) => Promise<DayActionOutcome>;
  onDayPlanCommitted: () => void;
}

export function MonthCalendarProjection(props: MonthCalendarProjectionProps) {
  const [viewOpen, setViewOpen] = useState(false);
  const [contextModal, setContextModal] = useState<{
    activeTab: 'library' | 'create-edit';
    boundDate: string | null;
  } | null>(null);
  const [dayLibraryQuery, setDayLibraryQuery] = useState('');
  const [pendingLibrarySelection, setPendingLibrarySelection] = useState<PlanDayTemplate | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const lastOpenerRef = useRef<HTMLElement | null>(null);

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

  const matchingDayPlans = props.dayPlans.filter((plan) =>
    plan.name.toLowerCase().includes(dayLibraryQuery.trim().toLowerCase()),
  );

  function rememberOpener(element: EventTarget | null) {
    if (element instanceof HTMLElement) lastOpenerRef.current = element;
  }

  function openModal(
    activeTab: 'library' | 'create-edit',
    boundDate: string | null,
    opener?: EventTarget | null,
  ) {
    rememberOpener(opener ?? null);
    setDayLibraryQuery('');
    setPendingLibrarySelection(null);
    setEditorDirty(false);
    setContextModal({ activeTab, boundDate });
  }

  function requestCloseModal() {
    if (editorDirty && !window.confirm('Close without saving your Day Plan draft?')) return;
    setContextModal(null);
    setPendingLibrarySelection(null);
    setEditorDirty(false);
  }

  function chooseDayPlan(template: PlanDayTemplate) {
    setPendingLibrarySelection(template);
    setContextModal((current) =>
      current ? { ...current, activeTab: 'create-edit' } : null,
    );
  }

  function datedTemplateFor(dateLocal: string): PlanDayTemplate | null {
    return datedTemplateByDate.get(dateLocal) ?? null;
  }

  function blankTemplateFor(dateLocal: string): PlanDayTemplate | null {
    return props.blankTemplateForDate(dateLocal) ?? props.dayDraftSeed;
  }

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{formatCalendarMonth(props.monthKey)}</h2>
            <button
              type="button"
              onClick={(event) => openModal('library', contextModal?.boundDate ?? null, event.currentTarget)}
              className={SMALL_BUTTON}
            >
              Open
            </button>
            <button
              type="button"
              onClick={(event) => openModal('create-edit', contextModal?.boundDate ?? null, event.currentTarget)}
              className={SMALL_BUTTON}
            >
              New
            </button>
          </div>
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
              <button
                key={day.dateLocal}
                type="button"
                data-testid="month-day-cell"
                data-date={day.dateLocal}
                data-in-month={inSelectedMonth ? 'true' : 'false'}
                data-planned={day.planned ? 'true' : 'false'}
                aria-label={`${day.dateLocal}: ${stateText}`}
                onClick={(event) => openModal('create-edit', day.dateLocal, event.currentTarget)}
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
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-white/45">
          A filled marker means the date contains planned meals. Select any date to open Day planning.
        </p>
      </section>

      {props.modalError ? (
        <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {props.modalError}
        </p>
      ) : null}

      {contextModal ? (
        <PlanContextModal
          title="Day Plan"
          titleId="month-day-context-modal-title"
          closeLabel="Close Day Plan"
          tablistLabel="Day planning tools"
          libraryTabLabel="Day Plan Library"
          createEditTabLabel="Create or Edit"
          activeTab={contextModal.activeTab}
          onTabChange={(activeTab) => setContextModal({ ...contextModal, activeTab })}
          onClose={requestCloseModal}
          returnFocusRef={lastOpenerRef}
          libraryPanel={
            <>
              <input
                type="search"
                value={dayLibraryQuery}
                onChange={(event) => setDayLibraryQuery(event.target.value)}
                placeholder="Search Day Plans"
                className="w-full rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-[#d7ecff]/60"
              />
              <ul className="mt-5 divide-y divide-white/10">
                {matchingDayPlans.map((plan) => (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => chooseDayPlan(plan)}
                      className="flex w-full items-center justify-between gap-4 px-2 py-4 text-left hover:bg-white/[0.04]"
                    >
                      <span>
                        <span className="block font-medium">{plan.name}</span>
                        <span className="mt-1 block text-xs text-white/45">
                          {plan.slots.length} occasions · {countTemplateMeals(plan)} Meals
                        </span>
                      </span>
                      <span aria-hidden className="text-white/35">→</span>
                    </button>
                  </li>
                ))}
              </ul>
              {matchingDayPlans.length === 0 ? (
                <p className="py-10 text-center text-sm text-white/45">No matching Day Plans.</p>
              ) : null}
            </>
          }
          createEditPanel={
            contextModal.boundDate && blankTemplateFor(contextModal.boundDate) ? (
              <EmbeddedDayPlanner
                key={contextModal.boundDate}
                dateLocal={contextModal.boundDate}
                blankTemplate={blankTemplateFor(contextModal.boundDate)!}
                datedTemplate={datedTemplateFor(contextModal.boundDate)}
                templates={props.dayPlans}
                busy={props.busy}
                draftContext="month"
                hideInlineLibrary
                pendingLibrarySelection={pendingLibrarySelection}
                onPendingLibrarySelectionHandled={() => setPendingLibrarySelection(null)}
                onDirtyChange={setEditorDirty}
                onApplyReusable={props.onApplyReusable}
                onCreateAndApply={props.onCreateAndApply}
                onSaveDated={props.onSaveDated}
                onApplied={() => {
                  setContextModal(null);
                  setPendingLibrarySelection(null);
                  setEditorDirty(false);
                  props.onDayPlanCommitted();
                }}
              />
            ) : (
              <div>
                <h3 className="text-lg font-semibold">Choose a date to create or edit</h3>
                <p className="mt-1 text-sm text-white/50">
                  Select a calendar date before applying a Day Plan. Browsing and drafting stay read-only until you choose a date.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {props.visibleDates.map((dateLocal) => (
                    <button
                      key={dateLocal}
                      type="button"
                      onClick={() =>
                        setContextModal({ activeTab: 'create-edit', boundDate: dateLocal })
                      }
                      className="rounded-2xl border border-white/10 px-3 py-3 text-left hover:bg-white/[0.06]"
                    >
                      <span className="block text-sm font-semibold">{dateLocal.slice(-2)}</span>
                      <span className="text-xs text-white/45">{fullDateLabel(dateLocal)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          }
        />
      ) : null}
    </>
  );
}
