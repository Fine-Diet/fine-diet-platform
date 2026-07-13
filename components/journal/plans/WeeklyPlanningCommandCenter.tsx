'use client';

/**
 * WeeklyPlanningCommandCenter
 *
 * Presentational weekly planning management surface for /app/plans/week.
 *
 * It resurfaces the weekly command center that the rebuilt Plans landing
 * page (now an overview/launch surface) stopped exposing directly:
 *   - Weekly summary cards (planned meals, open slots, decision load with a
 *     red/yellow/green pill, grocery readiness/blockers, execution state)
 *   - Projected NDS strip (per-day, tappable into the day editor)
 *   - Seven-day preview (one card per day → day editor)
 *   - Editing entry points (day editor, grocery, meal map, import)
 *   - Reusable planning entry points (saved day templates + week patterns,
 *     save current week as a pattern, apply a saved week pattern)
 *
 * All data loading, fetching, and API calls are owned by the parent page.
 * This component is intentionally side-effect free apart from invoking the
 * callbacks the page provides.
 */

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import type {
  Plan,
  PlanDay,
  PlanSlot,
  PlannedMeal,
  PlanDayTemplate,
  PlanWeekPattern,
} from '@/lib/plans';
import type { DateRange } from '@/lib/plans/planDateRange';
import { ProjectedNDSStrip } from './ProjectedNDSStrip';
import { DecisionLoadPill, type DecisionLoadTone } from './DecisionLoadPill';

export type { DecisionLoadTone };

export interface WeeklyCoverageSummary {
  plannedMeals: number;
  openSlots: number;
  totalSlots: number;
  percent: number;
  coverageLabel: string;
}

export interface WeeklyDecisionLoad {
  label: string;
  tone: DecisionLoadTone;
  description: string;
}

export interface WeeklyExecutionSummary {
  eaten: number;
  skipped: number;
  pending: number;
  hasState: boolean;
}

export interface WeeklyPantrySnapshot {
  headline: string;
  body: string;
  blockerNote: string | null;
  groceryHref: string | null;
}

export interface WeeklyPlanningCommandCenterProps {
  loadState: 'loading' | 'ready' | 'error';
  plan: Plan | null;
  hasProfileSchedule: boolean;
  selectedRange: DateRange;
  isCurrentWeek: boolean;
  weekDays: PlanDay[];
  planSlots: PlanSlot[];
  meals: PlannedMeal[];
  mealCountByDay: Record<string, number>;
  coverage: WeeklyCoverageSummary;
  decisionLoad: WeeklyDecisionLoad;
  execution: WeeklyExecutionSummary;
  pantry: WeeklyPantrySnapshot;
  templates: PlanDayTemplate[];
  weekPatterns: PlanWeekPattern[];
  groceryRangeHref: string | null;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onCustomRangeChange: (start: string, end: string) => void;
  /** Save the selected range plan days as a reusable week pattern. */
  onSaveWeekPattern: () => void;
  savingPattern: boolean;
  /** Apply a saved week pattern starting at the first plan day in the selected range. */
  onApplyWeekPattern: (patternId: string) => void;
  applyingPatternId: string | null;
  actionError: string | null;
}

const PRIMARY_BTN =
  'inline-flex w-full items-center justify-center rounded-full bg-[#d7ecff] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BTN =
  'inline-flex items-center justify-center rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/85 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50';

function slotLabel(slot: PlanSlot): string {
  if (slot.slot_label) return slot.slot_label;
  if (slot.slot_block) {
    return slot.slot_block.charAt(0).toUpperCase() + slot.slot_block.slice(1);
  }
  return `Slot ${slot.slot_ordinal + 1}`;
}

function formatWeekday(dateLocal: string): string {
  const [y, m, d] = dateLocal.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatDayNumber(dateLocal: string): string {
  const [y, m, d] = dateLocal.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatTile({
  label,
  value,
  description,
}: {
  label: string;
  value: ReactNode;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.05] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
      </p>
      <div className="mt-2 text-2xl font-semibold text-white antialiased">{value}</div>
      <p className="mt-1 text-[11px] leading-snug text-white/55 antialiased">{description}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-base font-semibold text-white antialiased">{children}</h2>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-6 text-center">
      <p className="text-sm text-white/65 antialiased">{message}</p>
      <Link href={APP_ROUTES.plans} className={`mt-4 ${PRIMARY_BTN}`}>
        Open Plans overview
      </Link>
    </div>
  );
}

export function WeeklyPlanningCommandCenter(props: WeeklyPlanningCommandCenterProps) {
  const {
    loadState,
    plan,
    hasProfileSchedule,
    selectedRange,
    isCurrentWeek,
    weekDays,
    planSlots,
    meals,
    mealCountByDay,
    coverage,
    decisionLoad,
    execution,
    pantry,
    templates,
    weekPatterns,
    groceryRangeHref,
    onPrevWeek,
    onNextWeek,
    onThisWeek,
    onCustomRangeChange,
    onSaveWeekPattern,
    savingPattern,
    onApplyWeekPattern,
    applyingPatternId,
    actionError,
  } = props;

  const mealsInRange = useMemo(() => {
    const dayIds = new Set(weekDays.map((day) => day.id));
    return meals.filter((meal) => dayIds.has(meal.plan_day_id));
  }, [weekDays, meals]);

  if (loadState === 'loading') {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-white/[0.05]" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.05]" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/[0.05]" />
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
        <p className="text-sm text-red-200 antialiased">
          We could not load your weekly planning context.
        </p>
        <Link href={APP_ROUTES.plans} className={`mt-4 ${PRIMARY_BTN}`}>
          Back to Plans
        </Link>
      </div>
    );
  }

  if (!plan) {
    return (
      <EmptyState
        message={
          hasProfileSchedule
            ? 'No active plan yet. Generate a week from the Plans overview to unlock your weekly command center.'
            : 'Add your meal schedule in Profile, then generate a week to see your weekly command center.'
        }
      />
    );
  }

  const firstDay = weekDays[0] ?? null;
  const primaryEditDate = firstDay?.date_local ?? selectedRange.start;

  return (
    <div className="space-y-8">
      {/* Weekly summary cards */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading>{isCurrentWeek ? 'This Week' : 'Selected Range'}</SectionHeading>
          <span className="text-[11px] text-white/45 antialiased">
            {formatDayNumber(selectedRange.start)} – {formatDayNumber(selectedRange.end)}
          </span>
        </div>

        <div className="mb-4 rounded-2xl bg-white/[0.04] p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onPrevWeek} className={SECONDARY_BTN}>
              ← Previous
            </button>
            <button
              type="button"
              onClick={onThisWeek}
              disabled={isCurrentWeek}
              className={SECONDARY_BTN}
            >
              This week
            </button>
            <button type="button" onClick={onNextWeek} className={SECONDARY_BTN}>
              Next →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[10px] text-white/40 antialiased">Start</span>
              <input
                type="date"
                value={selectedRange.start}
                onChange={(e) => {
                  const next = e.target.value;
                  onCustomRangeChange(next, selectedRange.end < next ? next : selectedRange.end);
                }}
                className="w-full rounded-xl border border-white/10 bg-brand-800 px-2 py-2 text-xs text-white antialiased focus:border-denim-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[10px] text-white/40 antialiased">End</span>
              <input
                type="date"
                value={selectedRange.end}
                min={selectedRange.start}
                onChange={(e) => onCustomRangeChange(selectedRange.start, e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-brand-800 px-2 py-2 text-xs text-white antialiased focus:border-denim-400 focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Planned meals"
            value={coverage.plannedMeals}
            description={coverage.coverageLabel}
          />
          <StatTile
            label="Open slots"
            value={coverage.totalSlots === 0 ? '—' : coverage.openSlots}
            description={
              coverage.totalSlots === 0
                ? 'No slots in this plan week yet.'
                : coverage.openSlots === 0
                  ? 'Every slot has a planned meal.'
                  : `${coverage.openSlots} slot${coverage.openSlots === 1 ? '' : 's'} still need a meal.`
            }
          />
          <div className="rounded-2xl bg-white/[0.05] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Decision load
            </p>
            <div className="mt-2">
              <DecisionLoadPill tone={decisionLoad.tone} label={decisionLoad.label} />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-white/55 antialiased">
              {decisionLoad.description}
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.05] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Grocery readiness
            </p>
            <p className="mt-2 text-sm font-semibold text-white antialiased">{pantry.headline}</p>
            <p className="mt-1 text-[11px] leading-snug text-white/55 antialiased">{pantry.body}</p>
            {pantry.blockerNote && (
              <p className="mt-2 text-[11px] text-amber-100/90 antialiased">{pantry.blockerNote}</p>
            )}
          </div>
        </div>

        {execution.hasState && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/80">
              <span className="font-semibold text-white">{execution.eaten}</span> eaten
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/80">
              <span className="font-semibold text-white">{execution.skipped}</span> skipped
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/80">
              <span className="font-semibold text-white">{execution.pending}</span> still planned
            </span>
          </div>
        )}
      </section>

      {/* Projected NDS */}
      <section>
        <SectionHeading>Projected NDS</SectionHeading>
        <ProjectedNDSStrip planId={plan.id} days={weekDays} mealCountByDay={mealCountByDay} />
      </section>

      {/* Seven-day preview */}
      <section>
        <SectionHeading>Week Preview</SectionHeading>
        {weekDays.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.04] p-5 text-sm text-white/55 antialiased">
            No plan days in {formatDayNumber(selectedRange.start)} –{' '}
            {formatDayNumber(selectedRange.end)}. Try another week or generate plan days from the
            Plans overview.
          </div>
        ) : (
          <div className="space-y-2">
            {weekDays.map((day) => {
              const daySlots = planSlots
                .filter((slot) => slot.plan_day_id === day.id)
                .sort((a, b) => a.slot_ordinal - b.slot_ordinal);
              const dayMeals = meals.filter((meal) => meal.plan_day_id === day.id);
              const plannedCount = dayMeals.length;
              const dayHref = `${APP_ROUTE_BUILDERS.planDay(day.date_local)}?planId=${encodeURIComponent(plan.id)}`;
              return (
                <Link
                  key={day.id}
                  href={dayHref}
                  className="block rounded-2xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white antialiased">
                        {formatWeekday(day.date_local)} · {formatDayNumber(day.date_local)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/45 antialiased">
                        {plannedCount} planned meal{plannedCount === 1 ? '' : 's'}
                        {daySlots.length > 0 ? ` · ${daySlots.length} slot${daySlots.length === 1 ? '' : 's'}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-white/30">→</span>
                  </div>

                  {daySlots.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {daySlots.map((slot) => {
                        const meal = dayMeals.find((m) => m.plan_slot_id === slot.id) ?? null;
                        const planned = Boolean(meal);
                        const eaten = meal?.execution_state === 'eaten';
                        const skipped = meal?.execution_state === 'skipped';
                        return (
                          <span
                            key={slot.id}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] antialiased ${
                              planned
                                ? 'bg-white/[0.08] text-white/85'
                                : 'border border-dashed border-white/20 text-white/45'
                            }`}
                            title={meal?.name ?? slotLabel(slot)}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                eaten
                                  ? 'bg-emerald-400'
                                  : skipped
                                    ? 'bg-white/30'
                                    : planned
                                      ? 'bg-[#d7ecff]'
                                      : 'bg-white/20'
                              }`}
                            />
                            {slotLabel(slot)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Editing entry points */}
      <section>
        <SectionHeading>Plan Tools</SectionHeading>
        <div className="space-y-2">
          {plan && (
            <Link
              href={`${APP_ROUTE_BUILDERS.planDay(primaryEditDate)}?planId=${encodeURIComponent(plan.id)}`}
              className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
            >
              <div>
                <p className="text-sm font-medium text-white antialiased">Edit a day</p>
                <p className="mt-0.5 text-[11px] text-white/45 antialiased">
                  Add, swap, move, or eat-out plan meals slot by slot.
                </p>
              </div>
              <span className="text-white/30">→</span>
            </Link>
          )}

          {groceryRangeHref && (
            <Link
              href={groceryRangeHref}
              className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
            >
              <div>
                <p className="text-sm font-medium text-white antialiased">Grocery for the week</p>
                <p className="mt-0.5 text-[11px] text-white/45 antialiased">
                  Roll up planned meals into a shopping list for this range.
                </p>
              </div>
              <span className="text-white/30">→</span>
            </Link>
          )}

          <Link
            href={APP_ROUTES.plans}
            className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
          >
            <div>
              <p className="text-sm font-medium text-white antialiased">Review meal map</p>
              <p className="mt-0.5 text-[11px] text-white/45 antialiased">
                See the Plans overview, rhythm, and saved meals.
              </p>
            </div>
            <span className="text-white/30">→</span>
          </Link>

          <Link
            href={APP_ROUTES.planImportNew}
            className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
          >
            <div>
              <p className="text-sm font-medium text-white antialiased">Import a recipe or meal</p>
              <p className="mt-0.5 text-[11px] text-white/45 antialiased">
                Paste a recipe or URL, review the draft, then drop it into a slot.
              </p>
            </div>
            <span className="text-white/30">→</span>
          </Link>
        </div>
      </section>

      {/* Reusable planning */}
      <section>
        <SectionHeading>Reusable Planning</SectionHeading>

        <div className="rounded-2xl bg-white/[0.04] p-4">
          <p className="text-sm font-semibold text-white antialiased">Week patterns</p>
          <p className="mt-0.5 text-[11px] text-white/45 antialiased">
            Save this week&apos;s structure once, then reapply it to future weeks.
          </p>

          <button
            type="button"
            onClick={onSaveWeekPattern}
            disabled={savingPattern || mealsInRange.length === 0}
            className={`mt-3 ${SECONDARY_BTN}`}
          >
            {savingPattern ? 'Saving…' : 'Save current week as a pattern'}
          </button>

          {weekPatterns.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {weekPatterns.map((pattern) => (
                <li
                  key={pattern.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white antialiased">{pattern.name}</p>
                    <p className="text-[11px] text-white/45 antialiased">
                      {pattern.days.length} day{pattern.days.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplyWeekPattern(pattern.id)}
                    disabled={applyingPatternId !== null}
                    className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/85 transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {applyingPatternId === pattern.id ? 'Applying…' : 'Apply'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[11px] text-white/30 antialiased">No saved week patterns yet.</p>
          )}
        </div>

        <div className="mt-3 rounded-2xl bg-white/[0.04] p-4">
          <p className="text-sm font-semibold text-white antialiased">Day templates</p>
          <p className="mt-0.5 text-[11px] text-white/45 antialiased">
            Saved single-day structures. Save and apply them from inside a day.
          </p>
          {templates.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {templates.slice(0, 6).map((template) => (
                <li
                  key={template.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white antialiased">{template.name}</p>
                    <p className="text-[11px] text-white/45 antialiased">
                      from {template.source_date_local}
                    </p>
                  </div>
                  {plan && (
                    <Link
                      href={`${APP_ROUTE_BUILDERS.planDay(primaryEditDate)}?planId=${encodeURIComponent(plan.id)}`}
                      className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/85 transition-colors hover:bg-white/[0.12]"
                    >
                      Apply in day
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[11px] text-white/30 antialiased">No saved day templates yet.</p>
          )}
        </div>
      </section>

      {actionError && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-xs text-red-200 antialiased">{actionError}</p>
        </div>
      )}
    </div>
  );
}
