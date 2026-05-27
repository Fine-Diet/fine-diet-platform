'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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

const UP_NEXT_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776797919858-Nutrition-Intensive-Slide-Stack-Image-Desktop-3x1-Z.jpg';
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

function buildLogHref(slot: ResolvedScheduleSlot): string {
  const params = new URLSearchParams({
    tab: 'food',
    mealSlot: slot.key,
    date: todayLocalKey(),
    time: slot.target_time,
  });
  return `${APP_ROUTES.logNew}?${params.toString()}`;
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function mealMatchesScheduleSlot(
  meal: PlannedMeal,
  slot: ResolvedScheduleSlot,
  planSlot: PlanSlot | null,
): boolean {
  const slotLabel = normalizeLabel(slot.label);
  const mealType = normalizeLabel(meal.meal_type);
  const planSlotLabel = normalizeLabel(planSlot?.slot_label);
  if (mealType && (mealType === slot.key || mealType === slotLabel)) return true;
  if (planSlot?.target_time && planSlot.target_time === slot.target_time) return true;
  return Boolean(planSlotLabel && slotLabel && planSlotLabel === slotLabel);
}

function findMealForScheduleSlot(
  slot: ResolvedScheduleSlot,
  dayMeals: PlannedMeal[],
  daySlots: PlanSlot[],
): PlannedMeal | null {
  for (const meal of dayMeals) {
    const planSlot = daySlots.find((s) => s.id === meal.plan_slot_id) ?? null;
    if (mealMatchesScheduleSlot(meal, slot, planSlot)) return meal;
  }
  return null;
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
      detail: 'Add meal windows in Profile to personalize planning.',
      meta: 'Profile owns meal schedule truth.',
      ctaLabel: 'Review Profile',
      ctaHref: APP_ROUTES.profile,
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

function Hero() {
  return (
    <section className="relative isolate overflow-hidden rounded-b-md bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
      <div className="absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-denim-500/20 blur-3xl" />
        <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-brand-200/10 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-brand-900/10 to-brand-900/60" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[1000px] px-5 pb-10 pt-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-50/40 antialiased">
          Plans
        </p>
        <h1 className="mx-auto mt-3 max-w-xl text-4xl font-semibold leading-[0.95] text-white antialiased sm:text-5xl">
          Messaging For Planning
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/70 antialiased sm:text-base">
          Your roadmap to sustainable results.
        </p>
      </div>
    </section>
  );
}

function ImageModuleCard({
  children,
  imageUrl,
  className = '',
}: {
  children: ReactNode;
  imageUrl: string;
  className?: string;
}) {
  return (
    <div className={`relative isolate overflow-hidden rounded-3xl border border-white/10 bg-brand-800 shadow-large ${className}`}>
      <Image
        src={imageUrl}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 850px"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-brand-900/50 to-brand-900/90" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function UpNextCard({
  summary,
  dayPlanHref,
}: {
  summary: UpNextSummary;
  dayPlanHref: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[850px]">
      <p className="mb-3 text-sm font-semibold text-brand-50/80 antialiased">Up Next</p>
      <ImageModuleCard imageUrl={UP_NEXT_BG}>
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold leading-none text-white antialiased">
                {summary.label}
              </h2>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {summary.status}
              </p>
              <p className="mt-0.5 text-sm text-white/60">{summary.meta}</p>
            </div>
            {summary.slot && (
              <Link
                href={summary.ctaHref}
                className="shrink-0 rounded-full bg-black/25 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur-md transition-colors hover:bg-black/30"
              >
                {summary.ctaLabel}
              </Link>
            )}
          </div>

          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-[1fr_auto]">
            <p className="text-white/80 antialiased">{summary.detail}</p>
            <p className="text-white/60 antialiased">{summary.meal?.meal_type ?? ''}</p>
          </div>

          {summary.needsSupport.length > 0 && (
            <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
              {summary.needsSupport.slice(0, 3).map((slot) => (
                <div key={slot.key} className="flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-white/50">
                      Needs Support
                    </p>
                    <p className="text-white/75">{formatTime12h(slot.target_time)}</p>
                  </div>
                  <p className="text-right text-white/60">{slot.label}</p>
                </div>
              ))}
            </div>
          )}

          <Link
            href={dayPlanHref}
            className="mt-5 block w-full rounded-full bg-brand-200 py-3 text-center text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-100"
          >
            See Full Day Details
          </Link>
          <p className="mt-2 text-center text-[10px] text-white/30">
            State: {summary.state}
          </p>
        </div>
      </ImageModuleCard>
    </section>
  );
}

function WeeklyRhythmCard({
  coverage,
  reviewHref,
}: {
  coverage: CoverageSummary;
  reviewHref: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[850px]">
      <p className="mb-3 text-sm font-semibold text-brand-50/80 antialiased">Weekly Rhythm</p>
      <ImageModuleCard imageUrl={WEEKLY_RHYTHM_BG}>
        <div className="p-5 sm:p-6">
          <h2 className="text-3xl font-semibold leading-none text-white antialiased">Overview</h2>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[150px_1fr] sm:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Coverage
                </p>
                <p className="mt-1 text-sm text-white/70">{coverage.label}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-brand-200"
                  style={{ width: `${coverage.percent}%` }}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[150px_1fr] sm:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Decision Load
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">TBD</p>
              </div>
              <p className="text-sm text-white/70">Logic coming soon</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[150px_1fr] sm:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Open Windows
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">-</p>
              </div>
              <p className="text-sm text-white/70">Priority windows coming soon</p>
            </div>
          </div>

          <Link
            href={reviewHref}
            className="mt-5 block w-full rounded-full bg-brand-200 py-3 text-center text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-100"
          >
            Review Meal Map
          </Link>
        </div>
      </ImageModuleCard>
    </section>
  );
}

function ActionCard({
  imageUrl,
  eyebrow,
  title,
  body,
  ctaLabel,
  href,
  disabled,
}: {
  imageUrl: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href?: string | null;
  disabled?: boolean;
}) {
  const content = (
    <article className={`flex h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] ${disabled ? 'opacity-70' : 'transition-colors hover:bg-white/[0.07]'}`}>
      <div className="relative h-auto w-28 shrink-0 overflow-hidden bg-brand-800 sm:w-32">
        <Image
          src={imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="128px"
        />
        <div className="absolute inset-0 bg-brand-900/20" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-base font-semibold leading-tight text-white antialiased">
          {title}
        </h3>
        <p className="mt-1 flex-1 text-xs leading-snug text-white/60 antialiased">
          {body}
        </p>
        <span className="mt-3 inline-flex w-fit rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/75">
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

function MealSchedulesSection({
  dayHref,
}: {
  dayHref: string | null;
}) {
  return (
    <section className="mx-auto w-full max-w-[850px]">
      <h2 className="mb-3 text-sm font-semibold text-brand-50/80 antialiased">Meal Schedules</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <ActionCard
          imageUrl={DAILY_SCHEDULE_BG}
          eyebrow="Daily Schedules"
          title="Create templates to repeat what works."
          body={dayHref ? 'Use the existing day page template workflow.' : 'Create a plan day first to save templates.'}
          ctaLabel="Create"
          href={dayHref}
          disabled={!dayHref}
        />
        <ActionCard
          imageUrl={WEEKLY_SCHEDULE_BG}
          eyebrow="Weekly Schedules"
          title="Plan your week and save for future use."
          body={dayHref ? 'Use the existing day page week-pattern workflow.' : 'Generate a week plan first to use patterns.'}
          ctaLabel="Generate"
          href={dayHref}
          disabled={!dayHref}
        />
      </div>
    </section>
  );
}

function MealsRecipesSection({
  savedMealHref,
}: {
  savedMealHref: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[850px]">
      <h2 className="mb-3 text-sm font-semibold text-brand-50/80 antialiased">
        Your Meals & Recipes
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <ActionCard
          imageUrl={MEALS_RECIPES_BG}
          eyebrow="Add Favorite Meals"
          title="Add your favorite meals."
          body="Create a saved meal from existing Log entries."
          ctaLabel="Add"
          href={savedMealHref}
        />
        <ActionCard
          imageUrl={MEALS_RECIPES_BG}
          eyebrow="Import Recipes"
          title="Import Your Favorite Recipes"
          body="Upload a recipe, link, or social video evidence for review."
          ctaLabel="Import"
          href={`${APP_ROUTES.plans}/imports/new`}
        />
      </div>
    </section>
  );
}

function GroceryManagementSection({
  groceryHref,
}: {
  groceryHref: string | null;
}) {
  return (
    <section className="mx-auto w-full max-w-[850px] rounded-3xl bg-black p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-semibold text-brand-50/80 antialiased">
        Grocery Management
      </h2>

      <div className="space-y-0 overflow-hidden rounded-2xl border border-white/20">
        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Your Pantry
          </p>
          <h3 className="mt-1 text-base font-semibold text-white antialiased">
            Inventory review is coming soon.
          </h3>
          <p className="mt-1 text-xs text-white/50">
            Pantry truth exists inside grocery workflows, but no dedicated review route was found.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 w-full cursor-not-allowed rounded-full bg-brand-200/50 py-3 text-sm font-semibold text-brand-900/70"
          >
            Review Inventory
          </button>
        </div>

        <div className="border-t border-white/10 p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Generate Grocery List
          </p>
          <h3 className="mt-1 text-base font-semibold text-white antialiased">
            Create a list from existing planned meals.
          </h3>
          <p className="mt-1 text-xs text-white/50">
            Generation is owned by the existing grocery route and service.
          </p>
          {groceryHref ? (
            <Link
              href={groceryHref}
              className="mt-4 block w-full rounded-full bg-brand-200 py-3 text-center text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-100"
            >
              Generate
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="mt-4 w-full cursor-not-allowed rounded-full bg-brand-200/50 py-3 text-sm font-semibold text-brand-900/70"
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

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <Hero />

        <div className="space-y-6 px-5 pt-6">
          {loadState === 'loading' ? (
            <div className="mx-auto w-full max-w-[850px] rounded-3xl bg-white/[0.04] p-5 animate-pulse">
              <div className="h-4 w-32 rounded bg-white/[0.06]" />
              <div className="mt-4 h-36 rounded-2xl bg-white/[0.06]" />
            </div>
          ) : (
            <>
              <UpNextCard summary={upNext} dayPlanHref={dayPlanHref} />
              <WeeklyRhythmCard coverage={coverage} reviewHref={APP_ROUTES.plans} />
              <MealSchedulesSection dayHref={plan && todayDay ? dayPlanHref : null} />
              <MealsRecipesSection savedMealHref="/journal/meals/create" />
              <GroceryManagementSection groceryHref={groceryHref} />
            </>
          )}

          {error && (
            <div className="mx-auto w-full max-w-[850px] rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-xs text-red-200 antialiased">{error}</p>
            </div>
          )}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
