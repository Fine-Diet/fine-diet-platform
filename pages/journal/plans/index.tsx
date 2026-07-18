'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { journalService, type MealTemplate } from '@/lib/journal';
import {
  APP_ROUTE_BUILDERS,
  APP_ROUTES,
} from '@/lib/routes/appRoutes';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlannedMeal,
  type PlanSlot,
} from '@/lib/plans';
import type {
  MealSchedule,
  ResolvedScheduleSlot,
} from '@/lib/plans/types';
import {
  defaultMealSchedule,
  hhmmToMinutes,
  normalizeMealSchedule,
} from '@/lib/plans/scheduleResolver';
import {
  buildMealSlotWindows,
  getEnabledMealSlots,
} from '@/lib/journal/mealScheduleAssignment';
import {
  findMealForScheduleSlot,
  mealMatchesScheduleSlot,
} from '@/lib/plans/matchScheduleSlot';
import {
  PANTRY_READINESS_COPY,
  readinessGroceryHref,
  readinessHasBlockers,
  usePantryReadiness,
  type PantryReadinessLoadState,
} from '@/lib/plans/usePantryReadiness';
import type { PantryReadinessSummary } from '@/lib/plans/types';

const PLANS_PAGE_MAX_WIDTH = 'max-w-[1000px]';
const PLANS_PRIMARY_BTN =
  'inline-flex w-full items-center justify-center rounded-full bg-[#d7ecff] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-brand-50';

// Stepped section "color breaks" matching the prototype: a warm brown zone for
// the Up Next / Overview blocks, a darker brown zone for the schedule/recipe
// blocks, then a black zone for Grocery Management.
const ZONE_WARM_BG = 'bg-[#302A21]';
const ZONE_DARK_BG = 'bg-[#1A160F]';
const ZONE_BLACK_BG = 'bg-black';
const WEEKLY_RHYTHM_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779838791937-pouring-water-sunlight.jpg';
const DAILY_SCHEDULE_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777417379310-Home-Journal-Mobile-4x5.jpg';
const WEEKLY_SCHEDULE_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779839046818-Wine-Silhouette.jpg';
const MEALS_RECIPES_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1772671962329-zucchini-apple.jpg';

type LoadState = 'loading' | 'ready' | 'error';

type UpNextState =
  | 'first-run/no schedule'
  | 'schedule exists/no saved meals'
  | 'schedule exists/no planned meals today'
  | 'meal scheduled'
  | 'meal open/due now'
  | 'needs support/open windows'
  | 'complete/no remaining windows'
  | 'fallback/error';

interface ProfileResponse {
  profile?: {
    meal_schedule?: unknown;
  };
}

interface UpNextSummary {
  state: UpNextState;
  slot: ResolvedScheduleSlot | null;
  meal: PlannedMeal | null;
  label: string;
  status: string;
  detail: string;
  meta: string;
  ctaLabel: string;
  ctaHref: string;
  needsSupport: ResolvedScheduleSlot[];
}

interface CoverageSummary {
  planned: number;
  possible: number;
  label: string;
  percent: number;
}

function todayLocalKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime12h(time24: string | null | undefined): string {
  if (!time24) return 'Time TBD';
  const [h, m] = time24.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time24;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Corrective fix (Phase 3 authenticated QA — defect log-return-path):
 * the Log page's back arrow already reads a safe `redirect` query param
 * (lib/redirectHelpers.ts getSafeRedirectTarget) and falls back to the Log
 * overview when it's absent — which is exactly what QA observed here. This
 * surface always renders the Plans home (at both /journal/plans and its
 * canonical /app/plans alias), so the redirect target is deterministic
 * rather than read from window.location.
 */
export function buildLogHref(slot: ResolvedScheduleSlot): string {
  const params = new URLSearchParams({
    tab: 'food',
    mealSlot: slot.key,
    date: todayLocalKey(),
    time: slot.target_time,
    redirect: APP_ROUTES.plans,
  });
  return `${APP_ROUTES.logNew}?${params.toString()}`;
}

function isSlotDueNow(slot: ResolvedScheduleSlot, slots: ResolvedScheduleSlot[]): boolean {
  const windows = buildMealSlotWindows(slots);
  const window = windows.find((w) => w.slot.key === slot.key);
  if (!window) return false;
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  return minute >= window.startMinute && minute < window.endMinute;
}

function chooseRelevantSlot(
  slots: ResolvedScheduleSlot[],
  dayMeals: PlannedMeal[],
  daySlots: PlanSlot[],
): ResolvedScheduleSlot | null {
  if (slots.length === 0) return null;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const open = slots.find((slot) => {
    if (!isSlotDueNow(slot, slots)) return false;
    return !findMealForScheduleSlot(slot, dayMeals, daySlots);
  });
  if (open) return open;

  const upcomingUnplanned = slots.find((slot) => {
    if (hhmmToMinutes(slot.target_time) < nowMinutes) return false;
    return !findMealForScheduleSlot(slot, dayMeals, daySlots);
  });
  if (upcomingUnplanned) return upcomingUnplanned;

  const upcomingPlanned = slots.find((slot) => hhmmToMinutes(slot.target_time) >= nowMinutes);
  if (upcomingPlanned) return upcomingPlanned;

  return slots[slots.length - 1] ?? null;
}

function buildDayPlanHref(plan: Plan | null, todayDay: PlanDay | null): string {
  if (!plan || !todayDay) return APP_ROUTES.plans;
  return `${APP_ROUTE_BUILDERS.planDay(todayDay.date_local)}?planId=${encodeURIComponent(plan.id)}`;
}

function buildGroceryHref(plan: Plan | null, days: PlanDay[]): string | null {
  if (!plan || days.length === 0) return null;
  const ordered = [...days].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const params = new URLSearchParams({ date: ordered[0]!.date_local });
  const last = ordered[Math.min(ordered.length - 1, 6)]!;
  if (last.date_local !== ordered[0]!.date_local) params.set('date_end', last.date_local);
  return `${APP_ROUTE_BUILDERS.planGrocery(plan.id)}?${params.toString()}`;
}

function buildGroceryHrefForRange(
  plan: Plan | null,
  start: string,
  end: string,
): string | null {
  if (!plan || !start) return null;
  const params = new URLSearchParams({ date: start });
  if (end && end !== start) params.set('date_end', end);
  return `${APP_ROUTE_BUILDERS.planGrocery(plan.id)}?${params.toString()}`;
}

function defaultPlanRange(days: PlanDay[]): { start: string; end: string } {
  if (days.length === 0) {
    const today = todayLocalKey();
    return { start: today, end: today };
  }
  const ordered = [...days].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const start = ordered[0]!.date_local;
  const end = ordered[Math.min(ordered.length - 1, 6)]!.date_local;
  return { start, end };
}

function buildUpNextSummary({
  loadState,
  hasProfileSchedule,
  savedMeals,
  plan,
  slots,
  todayDay,
  todaySlots,
  todayMeals,
  dayPlanHref,
}: {
  loadState: LoadState;
  hasProfileSchedule: boolean;
  savedMeals: MealTemplate[];
  plan: Plan | null;
  slots: ResolvedScheduleSlot[];
  todayDay: PlanDay | null;
  todaySlots: PlanSlot[];
  todayMeals: PlannedMeal[];
  dayPlanHref: string;
}): UpNextSummary {
  if (loadState === 'error') {
    return {
      state: 'fallback/error',
      slot: null,
      meal: null,
      label: 'Plans',
      status: 'CHECK',
      detail: 'We could not load your planning context.',
      meta: 'Try opening the full Plans workbench.',
      ctaLabel: 'Open Plans',
      ctaHref: APP_ROUTES.plans,
      needsSupport: [],
    };
  }

  if (!hasProfileSchedule) {
    return {
      state: 'first-run/no schedule',
      slot: null,
      meal: null,
      label: 'Meal schedule',
      status: 'SETUP',
      detail: 'Finish a quick onboarding to set up your meal schedule.',
      meta: 'Onboarding seeds your meal schedule and preferences.',
      ctaLabel: 'Start onboarding',
      ctaHref: APP_ROUTES.onboarding,
      needsSupport: [],
    };
  }

  if (slots.length === 0) {
    return {
      state: 'first-run/no schedule',
      slot: null,
      meal: null,
      label: 'Meal schedule',
      status: 'SETUP',
      detail: 'No meal windows are enabled right now.',
      meta: 'Enable windows in Profile before planning.',
      ctaLabel: 'Review Profile',
      ctaHref: APP_ROUTES.profile,
      needsSupport: [],
    };
  }

  const needsSupport = slots.filter((slot) => !findMealForScheduleSlot(slot, todayMeals, todaySlots));

  if (savedMeals.length === 0) {
    const slot = chooseRelevantSlot(slots, todayMeals, todaySlots) ?? slots[0]!;
    const dueNow = isSlotDueNow(slot, slots);
    return {
      state: 'schedule exists/no saved meals',
      slot,
      meal: null,
      label: slot.label,
      status: dueNow ? 'OPEN' : 'SCHEDULED',
      detail: 'No saved meals yet. Log now or add a favorite meal to make planning easier.',
      meta: formatTime12h(slot.target_time),
      ctaLabel: dueNow ? 'Log Now' : 'Add Favorite Meal',
      ctaHref: dueNow ? buildLogHref(slot) : '/journal/meals/create',
      needsSupport,
    };
  }

  if (!plan || !todayDay || todayMeals.length === 0) {
    const slot = chooseRelevantSlot(slots, todayMeals, todaySlots) ?? slots[0]!;
    const dueNow = isSlotDueNow(slot, slots);
    return {
      state: plan && todayDay ? 'schedule exists/no planned meals today' : 'meal open/due now',
      slot,
      meal: null,
      label: slot.label,
      status: dueNow ? 'OPEN' : 'NEEDS SUPPORT',
      detail: dueNow
        ? 'This meal window is open. Log now while planning catches up.'
        : 'Your schedule exists, but today has no planned meal for this window.',
      meta: formatTime12h(slot.target_time),
      ctaLabel: dueNow ? 'Log Now' : 'See Full Day Details',
      ctaHref: dueNow ? buildLogHref(slot) : dayPlanHref,
      needsSupport,
    };
  }

  const relevant = chooseRelevantSlot(slots, todayMeals, todaySlots) ?? slots[0]!;
  const meal = findMealForScheduleSlot(relevant, todayMeals, todaySlots);
  const dueNow = isSlotDueNow(relevant, slots);

  if (meal) {
    return {
      state: dueNow ? 'meal open/due now' : 'meal scheduled',
      slot: relevant,
      meal,
      label: relevant.label,
      status: dueNow ? 'OPEN' : 'SCHEDULED',
      detail: meal.name ?? 'Planned meal',
      meta: formatTime12h(relevant.target_time),
      ctaLabel: dueNow ? 'Log Now' : 'See Full Day Details',
      ctaHref: dueNow ? buildLogHref(relevant) : dayPlanHref,
      needsSupport,
    };
  }

  if (needsSupport.length > 0) {
    return {
      state: 'needs support/open windows',
      slot: relevant,
      meal: null,
      label: relevant.label,
      status: dueNow ? 'OPEN' : 'NEEDS SUPPORT',
      detail: 'This meal window needs support.',
      meta: formatTime12h(relevant.target_time),
      ctaLabel: dueNow ? 'Log Now' : 'See Full Day Details',
      ctaHref: dueNow ? buildLogHref(relevant) : dayPlanHref,
      needsSupport,
    };
  }

  return {
    state: 'complete/no remaining windows',
    slot: slots[slots.length - 1] ?? null,
    meal: null,
    label: 'Today',
    status: 'COMPLETE',
    detail: 'All enabled meal windows have planned support today.',
    meta: `${todayMeals.length} planned meal${todayMeals.length === 1 ? '' : 's'}`,
    ctaLabel: 'See Full Day Details',
    ctaHref: dayPlanHref,
    needsSupport: [],
  };
}

function buildCoverageSummary({
  slots,
  days,
  planSlots,
  meals,
}: {
  slots: ResolvedScheduleSlot[];
  days: PlanDay[];
  planSlots: PlanSlot[];
  meals: PlannedMeal[];
}): CoverageSummary {
  const possible = slots.length * 7;
  if (possible === 0) {
    return { planned: 0, possible: 0, label: 'Meal schedule needed', percent: 0 };
  }

  const weekDays = [...days]
    .sort((a, b) => a.date_local.localeCompare(b.date_local))
    .slice(0, 7);
  const dayIds = new Set(weekDays.map((day) => day.id));
  const counted = new Set<string>();

  for (const meal of meals) {
    if (!dayIds.has(meal.plan_day_id)) continue;
    const planSlot = planSlots.find((slot) => slot.id === meal.plan_slot_id) ?? null;
    const matchedSchedule = slots.find((slot) => mealMatchesScheduleSlot(meal, slot, planSlot));
    if (!matchedSchedule) continue;
    counted.add(`${meal.plan_day_id}:${matchedSchedule.key}`);
  }

  const planned = counted.size;
  const percent = Math.min(100, Math.round((planned / possible) * 100));
  return {
    planned,
    possible,
    percent,
    label: `${planned} of ${possible} meal windows planned this week`,
  };
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 px-1 text-base font-semibold text-white antialiased">
      {children}
    </p>
  );
}

function UpNextRow({
  eyebrow,
  time,
  value,
  divider = false,
}: {
  eyebrow: string;
  time: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div className={divider ? 'border-t border-white/15 pt-3' : ''}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
            {eyebrow}
          </p>
          <p className="mt-0.5 text-sm font-medium text-white/90 antialiased">{time}</p>
        </div>
        <p className="max-w-[55%] text-right text-sm text-white/80 antialiased">{value}</p>
      </div>
    </div>
  );
}

function UpNextCard({
  summary,
}: {
  summary: UpNextSummary;
}) {
  return (
    <section className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH}`}>
      <SectionLabel>Up Next</SectionLabel>
      <div className="overflow-hidden rounded-[24px] border border-brand-50/50 bg-brand-800 shadow-large">
        <div className="p-5 sm:p-8">
          <h2 className="text-[1.7rem] font-semibold leading-tight text-white antialiased sm:text-3xl">
            {summary.label}
          </h2>

          <div className="mt-4 space-y-3">
            {summary.meal ? (
              <UpNextRow
                eyebrow={summary.status === 'OPEN' ? 'Open Now' : 'Scheduled'}
                time={summary.meta}
                value={summary.detail}
              />
            ) : (
              <p className="text-sm leading-snug text-white/80 antialiased">
                {summary.detail}
              </p>
            )}

            {summary.needsSupport.slice(0, 2).map((slot) => (
              <UpNextRow
                key={slot.key}
                divider
                eyebrow="Needs Support"
                time={formatTime12h(slot.target_time)}
                value={slot.label}
              />
            ))}
          </div>

          <Link href={summary.ctaHref} className={`mt-6 ${PLANS_PRIMARY_BTN}`}>
            {summary.ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

interface OverviewMetric {
  label: string;
  control: ReactNode;
  description: string;
}

function deriveDecisionLoad(coverage: CoverageSummary): { label: string; description: string } {
  if (coverage.possible === 0) {
    return { label: '—', description: 'Add a meal schedule to begin.' };
  }
  if (coverage.percent >= 66) {
    return { label: 'Low', description: 'Most nourishment decisions are covered.' };
  }
  if (coverage.percent >= 34) {
    return { label: 'Moderate', description: 'Some decisions still need your attention.' };
  }
  return { label: 'High', description: 'Most meals still need a plan.' };
}

function OverviewRow({ metric, divider }: { metric: OverviewMetric; divider: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${divider ? 'border-t border-white/12 pt-4' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {metric.label}
        </p>
        <div className="mt-2">{metric.control}</div>
      </div>
      <p className="max-w-[52%] text-right text-sm text-white/75 antialiased">
        {metric.description}
      </p>
    </div>
  );
}

function OverviewCard({
  coverage,
  reviewHref,
}: {
  coverage: CoverageSummary;
  reviewHref: string;
}) {
  const openWindows = Math.max(0, coverage.possible - coverage.planned);
  const decisionLoad = deriveDecisionLoad(coverage);

  const metrics: OverviewMetric[] = [
    {
      label: 'Coverage',
      control: (
        <div className="h-2 w-32 overflow-hidden rounded-full bg-white/20 sm:w-40">
          <div
            className="h-full rounded-full bg-[#d7ecff]"
            style={{ width: `${coverage.percent}%` }}
          />
        </div>
      ),
      description: coverage.label,
    },
    {
      label: 'Decision Load',
      control: (
        <span className="inline-flex items-center rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white/90">
          {decisionLoad.label}
        </span>
      ),
      description: decisionLoad.description,
    },
    {
      label: 'Open Windows',
      control: (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-sm font-semibold text-white">
          {coverage.possible === 0 ? '—' : openWindows}
        </span>
      ),
      description:
        coverage.possible === 0
          ? 'Add a meal schedule to begin.'
          : openWindows === 0
            ? 'All meal windows are covered.'
            : `${openWindows} window${openWindows === 1 ? '' : 's'} still need support.`,
    },
  ];

  return (
    <section className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH}`}>
      <SectionLabel>Weekly Rhythm</SectionLabel>
      <div className="overflow-hidden rounded-[24px] border border-brand-50/50 bg-brand-800 shadow-large">
        <div className="p-5 sm:p-8">
          <h2 className="text-[1.7rem] font-semibold leading-tight text-white antialiased sm:text-3xl">
            Overview
          </h2>

          <div className="mt-5 space-y-4">
            {metrics.map((metric, index) => (
              <OverviewRow key={metric.label} metric={metric} divider={index > 0} />
            ))}
          </div>

          <Link href={reviewHref} className={`mt-6 ${PLANS_PRIMARY_BTN}`}>
            Open Weekly Planner
          </Link>
        </div>
      </div>
    </section>
  );
}

function ScheduleCard({
  imageUrl,
  eyebrow,
  title,
  ctaLabel,
  href,
  disabled,
}: {
  imageUrl: string;
  eyebrow: string;
  title: string;
  ctaLabel: string;
  href?: string | null;
  disabled?: boolean;
}) {
  const content = (
    <article
      className={`flex h-full items-center gap-4 rounded-[20px] bg-[#17100c] p-3 ${
        disabled ? 'opacity-70' : 'transition-colors hover:bg-[#1f1610]'
      }`}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-brand-800">
        <Image src={imageUrl} alt="" fill className="object-cover" sizes="80px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-sm font-semibold leading-snug text-white antialiased">
          {title}
        </h3>
        <span className="mt-2 inline-flex rounded-full border border-white/30 px-3 py-1 text-xs font-semibold text-white/85">
          {ctaLabel}
        </span>
      </div>
    </article>
  );

  if (disabled || !href) return content;
  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}

function MealSchedulesSection({ dayHref }: { dayHref: string | null }) {
  return (
    <section className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH}`}>
      <SectionLabel>Meal Schedules</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <ScheduleCard
          imageUrl={DAILY_SCHEDULE_BG}
          eyebrow="Daily Schedules"
          title="Create templates to repeat daily the meals you prefer."
          ctaLabel="Add Templates"
          href={dayHref}
          disabled={!dayHref}
        />
        <ScheduleCard
          imageUrl={WEEKLY_SCHEDULE_BG}
          eyebrow="Weekly Schedules"
          title="Plan your week and save for future use and adjustments."
          ctaLabel="Add Templates"
          href={dayHref}
          disabled={!dayHref}
        />
      </div>
    </section>
  );
}

function RecipeCard({
  imageUrl,
  title,
  body,
  href,
}: {
  imageUrl: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[20px] bg-brand-50 p-3 text-black shadow-large transition-transform hover:scale-[1.01]"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
        <Image src={imageUrl} alt="" fill className="object-cover" sizes="80px" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold leading-snug text-black antialiased">{title}</h3>
        <p className="mt-1 text-xs leading-snug text-black/60 antialiased">{body}</p>
      </div>
      <svg
        aria-hidden
        className="h-5 w-5 shrink-0 text-black/40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function MealsRecipesSection({ savedMealHref }: { savedMealHref: string }) {
  return (
    <section className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH}`}>
      <SectionLabel>Your Meals &amp; Recipes</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <RecipeCard
          imageUrl={MEALS_RECIPES_BG}
          title="Add your favorite meals"
          body="Saving your meals is the first step to staying on track with your nutrition goals."
          href={savedMealHref}
        />
        <RecipeCard
          imageUrl={WEEKLY_RHYTHM_BG}
          title="Import Your Favorite Recipes"
          body="Upload a screen shot, paste a recipe or URL. Review the draft, save it to use."
          href={APP_ROUTES.planImportNew}
        />
      </div>
    </section>
  );
}

interface PantrySnapshot {
  headline: string;
  body: string;
  chips: Array<{ label: string; value: number }> | null;
  blockerNote: string | null;
  groceryHref: string;
}

function derivePantrySnapshot(
  state: PantryReadinessLoadState,
  summary: PantryReadinessSummary | null,
  fallbackGroceryHref: string,
): PantrySnapshot {
  if (state !== 'ready' || !summary) {
    return {
      headline: 'Save what you already have on hand.',
      body: 'Keep on-hand items saved so future grocery lists are easier to execute.',
      chips: null,
      blockerNote: null,
      groceryHref: fallbackGroceryHref,
    };
  }

  const groceryHref = readinessGroceryHref(summary) ?? fallbackGroceryHref;

  if (summary.state === 'no_plan') {
    return {
      headline: 'No active plan yet',
      body: 'Start a plan to see how your saved Pantry affects upcoming grocery lists.',
      chips: null,
      blockerNote: null,
      groceryHref,
    };
  }

  if (summary.state === 'no_grocery_list') {
    return {
      headline: PANTRY_READINESS_COPY.noActiveGroceryList,
      body: 'Generate a grocery list to compare it against your Pantry.',
      chips: null,
      blockerNote: null,
      groceryHref,
    };
  }

  if (summary.state === 'no_pantry') {
    return {
      headline: 'Add items you already have',
      body: 'Saving on-hand Pantry items lets safe matches reduce what you still need to buy.',
      chips: null,
      blockerNote: null,
      groceryHref,
    };
  }

  const coverage = summary.coverage;
  return {
    headline: 'Your pantry is working for you',
    body: 'Safe canonical matches reduce what you still need to buy. Required amounts stay primary.',
    chips: coverage
      ? [
          { label: 'saved', value: summary.pantry_items_saved },
          { label: 'covered', value: coverage.rows_covered_full },
          { label: 'to buy', value: coverage.rows_to_buy },
        ]
      : [{ label: 'saved', value: summary.pantry_items_saved }],
    blockerNote: readinessHasBlockers(coverage)
      ? 'Some grocery rows need review before Pantry can apply.'
      : null,
    groceryHref,
  };
}

function GroceryManagementSection({
  plan,
  days,
  pantry,
}: {
  plan: Plan | null;
  days: PlanDay[];
  pantry: PantrySnapshot;
}) {
  const defaults = useMemo(() => defaultPlanRange(days), [days]);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
  }, [defaults.start, defaults.end]);

  const generateHref = buildGroceryHrefForRange(plan, start, end);

  return (
    <section className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH} rounded-[28px] bg-black p-4 sm:p-6`}>
      <h2 className="mb-4 px-1 text-base font-semibold text-white antialiased">
        Grocery Management
      </h2>

      <div className="overflow-hidden rounded-[20px] border border-white/15">
        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Your Pantry
          </p>
          <h3 className="mt-1 text-base font-semibold text-white antialiased">
            {pantry.headline}
          </h3>
          <p className="mt-1 text-xs leading-snug text-white/55 antialiased">{pantry.body}</p>

          {pantry.chips && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pantry.chips.map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/80"
                >
                  <span className="font-semibold text-white">{chip.value}</span>
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          {pantry.blockerNote && (
            <p className="mt-3 text-xs text-amber-100/90 antialiased">{pantry.blockerNote}</p>
          )}

          <Link href={APP_ROUTES.pantry} className={`mt-4 ${PLANS_PRIMARY_BTN}`}>
            Review Inventory
          </Link>
        </div>

        <div className="border-t border-white/10 p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Generate Grocery List
          </p>
          <h3 className="mt-1 text-base font-semibold text-white antialiased">
            Create a list of items that you&apos;ll need to make your meals from a date range.
          </h3>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block text-[11px] font-medium text-white/55">
              Start
              <input
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                disabled={!plan}
                className="mt-1 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#d7ecff] disabled:cursor-not-allowed disabled:opacity-60 [color-scheme:dark]"
              />
            </label>
            <label className="block text-[11px] font-medium text-white/55">
              End
              <input
                type="date"
                value={end}
                min={start}
                onChange={(event) => setEnd(event.target.value)}
                disabled={!plan}
                className="mt-1 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#d7ecff] disabled:cursor-not-allowed disabled:opacity-60 [color-scheme:dark]"
              />
            </label>
          </div>

          {generateHref ? (
            <Link href={generateHref} className={`mt-4 ${PLANS_PRIMARY_BTN}`}>
              Generate
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="mt-4 w-full cursor-not-allowed rounded-full bg-[#d7ecff]/40 py-3 text-sm font-semibold text-black/60"
            >
              Generate
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function JournalPlansIndexPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [planSlots, setPlanSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [schedule, setSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
  const [hasProfileSchedule, setHasProfileSchedule] = useState(false);
  const [savedMeals, setSavedMeals] = useState<MealTemplate[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const { summary: readiness, state: readinessState } = usePantryReadiness();

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      setLoadState('loading');
      setError(null);
      try {
        const [profileRes, snapRes, plans, mealTemplates] = await Promise.all([
          fetch('/api/journal/profile', { credentials: 'include' })
            .then(async (res) => {
              if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
              return (await res.json()) as ProfileResponse;
            })
            .catch(() => null),
          planService.getLiveSnapshot().catch(() => null),
          planService.list(),
          journalService.listMealTemplates().catch(() => []),
        ]);

        const rawSchedule =
          profileRes?.profile?.meal_schedule ??
          snapRes?.snapshot.schedule_snapshot?.profile_schedule ??
          null;
        setHasProfileSchedule(Boolean(rawSchedule));
        setSchedule(normalizeMealSchedule(rawSchedule));
        setSavedMeals(mealTemplates);

        const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
        if (active) {
          const detail = await planService.getDetail(active.id);
          setPlan(detail.plan);
          setDays(detail.days);
          setPlanSlots(detail.slots);
          setMeals(detail.meals);
        }
        setLoadState('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Plans.');
        setLoadState('error');
      }
    })();
  }, []);

  const enabledSlots = useMemo(() => getEnabledMealSlots(schedule), [schedule]);
  const today = todayLocalKey();
  const todayDay = useMemo(
    () => days.find((day) => day.date_local === today) ?? null,
    [days, today],
  );
  const todaySlots = useMemo(
    () => (todayDay ? planSlots.filter((slot) => slot.plan_day_id === todayDay.id) : []),
    [planSlots, todayDay],
  );
  const todayMeals = useMemo(
    () => (todayDay ? meals.filter((meal) => meal.plan_day_id === todayDay.id) : []),
    [meals, todayDay],
  );
  const dayPlanHref = useMemo(() => buildDayPlanHref(plan, todayDay), [plan, todayDay]);
  const groceryHref = useMemo(() => buildGroceryHref(plan, days), [plan, days]);
  const coverage = useMemo(
    () => buildCoverageSummary({ slots: enabledSlots, days, planSlots, meals }),
    [enabledSlots, days, planSlots, meals],
  );
  const upNext = useMemo(
    () => buildUpNextSummary({
      loadState,
      hasProfileSchedule,
      savedMeals,
      plan,
      slots: enabledSlots,
      todayDay,
      todaySlots,
      todayMeals,
      dayPlanHref,
    }),
    [loadState, hasProfileSchedule, savedMeals, plan, enabledSlots, todayDay, todaySlots, todayMeals, dayPlanHref],
  );
  const pantry = useMemo(
    () => derivePantrySnapshot(readinessState, readiness, groceryHref ?? APP_ROUTES.plans),
    [readinessState, readiness, groceryHref],
  );

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        {loadState === 'loading' ? (
          <StackedPageSection layer={1} className={`mt-0 pt-[70px] sm:pt-16 ${ZONE_WARM_BG} pb-10`} contentClassName="max-w-none">
            <div className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH} rounded-[24px] bg-white/[0.04] p-5 animate-pulse`}>
              <div className="h-4 w-32 rounded bg-white/[0.06]" />
              <div className="mt-4 h-36 rounded-2xl bg-white/[0.06]" />
            </div>
          </StackedPageSection>
        ) : (
          <>
            {/* Zone 1 — warm brown: Up Next + Overview */}
            <StackedPageSection layer={1} className={`mt-0 pt-[70px] sm:pt-16 ${ZONE_WARM_BG}`} contentClassName="max-w-none">
              <UpNextCard summary={upNext} />
            </StackedPageSection>
            <StackedPageSection layer={2} className={ZONE_WARM_BG} contentClassName="max-w-none">
              <OverviewCard coverage={coverage} reviewHref={APP_ROUTES.plansWeek} />
            </StackedPageSection>
            {/* Zone 2 — darker brown: Meal Schedules + Your Meals & Recipes */}
            <StackedPageSection layer={3} className={ZONE_DARK_BG} contentClassName="max-w-none">
              <MealSchedulesSection dayHref={plan && todayDay ? dayPlanHref : null} />
            </StackedPageSection>
            <StackedPageSection layer={4} className={ZONE_DARK_BG} contentClassName="max-w-none">
              <MealsRecipesSection savedMealHref="/journal/meals/create" />
            </StackedPageSection>
            {/* Zone 3 — black: Grocery Management */}
            <StackedPageSection layer={5} className={`${ZONE_BLACK_BG} pb-10`} contentClassName="max-w-none">
              <GroceryManagementSection plan={plan} days={days} pantry={pantry} />
            </StackedPageSection>
          </>
        )}

        {error && (
          <StackedPageSection layer={6} className={`${ZONE_BLACK_BG} pb-10`} contentClassName="max-w-none">
            <div className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH} rounded-2xl border border-red-500/20 bg-red-500/10 p-4`}>
              <p className="text-xs text-red-200 antialiased">{error}</p>
            </div>
          </StackedPageSection>
        )}
      </div>

      <JournalFooterNav />
    </div>
  );
}
