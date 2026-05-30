'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  type JournalEntry,
} from '@/lib/journal';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { useNDS, type NDSData } from '@/lib/nds/useNDS';
import { planService, type Plan, type PlanDay } from '@/lib/plans';
import {
  PANTRY_READINESS_COPY,
  readinessGroceryHref,
  readinessHasBlockers,
  usePantryReadiness,
  type PantryReadinessLoadState,
} from '@/lib/plans/usePantryReadiness';
import type {
  MealSchedule,
  PantryReadinessSummary,
  ResolvedScheduleSlot,
} from '@/lib/plans/types';
import { defaultMealSchedule, hhmmToMinutes, normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import {
  getEnabledMealSlots,
  getMealSlotForEntry,
} from '@/lib/journal/mealScheduleAssignment';

/* ------------------------------------------------------------------ */
/*  Verified route map — every href below has a matching page file     */
/*  pages/app/log/new.tsx         → /app/log/new                      */
/*  pages/app/log/index.tsx       → /app/log                          */
/*  pages/app/programs/index.tsx  → /app/programs                     */
/*  pages/app/plans/index.tsx     → /app/plans                        */
/*  pages/app/pantry.tsx          → /app/pantry                       */
/*  pages/app/profile.tsx         → /app/profile                      */
/*  pages/account/assessments.tsx → /account/assessments              */
/*  pages/programs.tsx            → /programs                         */
/*  pages/shop.tsx                → /shop                             */
/*  pages/account/index.tsx       → /account                          */
/* ------------------------------------------------------------------ */

const TODAY_RHYTHM_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776880779332-Gut-Rebalance-Slide-Stack-Image-Desktop-3x1-Z.jpg';
const PREP_PANTRY_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1772671962329-zucchini-apple.jpg';
const BASELINE_CARD_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';
const CASE_STUDY_CARD_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776802981375-Case-Study-Dondrea-1x1.jpg';

type NDSStatus = 'Strong' | 'Building' | 'Support' | 'Watch' | 'Logged' | 'Pending';

// ── Helpers ──────────────────────────────────────────────────────────

function formatTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function todayLocalKey(): string {
  return toDateKey(new Date());
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getSubscoreStatus(score: number | null, hasLoggedNutrition: boolean): NDSStatus {
  if (score === null || Number.isNaN(score)) return hasLoggedNutrition ? 'Logged' : 'Pending';
  if (score >= 8) return 'Strong';
  if (score >= 6) return 'Building';
  if (score >= 4) return 'Support';
  return 'Watch';
}

function buildLogMealHref(slot: ResolvedScheduleSlot): string {
  const params = new URLSearchParams({
    tab: 'food',
    mealSlot: slot.key,
    date: todayLocalKey(),
    time: slot.target_time,
  });
  return `${APP_ROUTES.logNew}?${params.toString()}`;
}

function isMealSlotLogged(
  slot: ResolvedScheduleSlot,
  todayEntries: JournalEntry[],
  enabledSlots: ResolvedScheduleSlot[],
): boolean {
  return todayEntries.some((entry) => {
    if (entry.type !== 'intake') return false;
    return getMealSlotForEntry(entry, enabledSlots)?.key === slot.key;
  });
}

function chooseActionableMeal(
  slots: ResolvedScheduleSlot[],
  todayEntries: JournalEntry[],
): ResolvedScheduleSlot | null {
  if (slots.length === 0) return null;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const unlogged = slots.filter((slot) => !isMealSlotLogged(slot, todayEntries, slots));
  if (unlogged.length === 0) return null;

  const current = unlogged.find((slot, index) => {
    const previous = slots[index - 1] ?? null;
    const next = slots[index + 1] ?? null;
    const target = hhmmToMinutes(slot.target_time);
    const start = previous ? Math.round((hhmmToMinutes(previous.target_time) + target) / 2) : 0;
    const end = next ? Math.round((target + hhmmToMinutes(next.target_time)) / 2) : 24 * 60;
    return nowMinutes >= start && nowMinutes < end;
  });
  if (current) return current;

  return unlogged.find((slot) => hhmmToMinutes(slot.target_time) >= nowMinutes) ?? unlogged[0] ?? null;
}

function TodayRhythmModule({
  slots,
  todayEntries,
  loading,
  dayPlanHref,
}: {
  slots: ResolvedScheduleSlot[];
  todayEntries: JournalEntry[];
  loading: boolean;
  dayPlanHref: string;
}) {
  const actionable = chooseActionableMeal(slots, todayEntries);

  return (
    <section className="w-full max-w-[750px] mx-auto">
      <div className="mb-3">
        <p className="text-base sm:text-xl font-semibold text-white antialiased">
          Today&apos;s Rhythm
        </p>
      </div>
      <div className="relative isolate overflow-hidden rounded-[24px] bg-brand-800 shadow-large">
        <Image
          src={TODAY_RHYTHM_BG}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 750px"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-brand-900/40 to-black/65" />
        <div className="relative z-10 px-5 py-10 sm:px-16 sm:py-12">
          <div className="sm:mb-1 mb-2">
            <h2 className="text-[1.5rem] font-semibold text-white antialiased sm:text-3xl">Schedule Preview</h2>
          </div>

          <div className="space-y-0.5">
            {loading ? (
              [0, 1, 2].map((item) => (
                <div key={item} className="h-7 rounded-full bg-white/[0.10] animate-pulse" />
              ))
            ) : slots.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.10] p-4 text-sm text-white/80">
                Add meal times in Profile to personalize your rhythm.
              </div>
            ) : (
              slots.map((slot) => {
                const logged = isMealSlotLogged(slot, todayEntries, slots);
                const isActionable = actionable?.key === slot.key;
                const rowClassName =
                  'grid grid-cols-[86px_1fr_auto] items-center gap-3 rounded-full px-4 py-0.5 text-sm transition-colors sm:text-base';
                const rowContent = (
                  <>
                    <span className="whitespace-nowrap text-white antialiased">{formatTime12h(slot.target_time)}</span>
                    <span className="truncate font-semibold text-white antialiased sm:font-normal">{slot.label}</span>
                    <span
                      className={`shrink-0 justify-self-end text-right ${
                        isActionable ? 'font-semibold text-white sm:font-normal' : 'text-white/55'
                      }`}
                    >
                      {isActionable ? 'Log Now' : logged ? 'Logged' : 'Upcoming'}
                    </span>
                  </>
                );

                return isActionable ? (
                  <Link
                    key={slot.key}
                    href={buildLogMealHref(slot)}
                    className={`${rowClassName} bg-white/20 text-white hover:bg-white/[0.35]`}
                  >
                    {rowContent}
                  </Link>
                ) : (
                  <div key={slot.key} className={`${rowClassName} bg-transparent text-white/85`}>
                    {rowContent}
                  </div>
                );
              })
            )}
          </div>

          <Link
            href={dayPlanHref}
            className="mt-4 block w-full rounded-full bg-[#d7ecff] py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-brand-50"
          >
            View Full Day Plan
          </Link>
        </div>
      </div>
    </section>
  );
}

function NutritionDensityModule({
  data,
  isLoading,
}: {
  data: NDSData | null;
  isLoading: boolean;
}) {
  const hasLoggedNutrition = Boolean((data?._meta?.intake_count ?? 0) > 0 || (data?._meta?.meal_count ?? 0) > 0);
  const overallScore = data ? Math.round(data.nds_score_100) : null;
  const factors: Array<{ label: string; score: number | null }> = [
    { label: 'Whole Food Ratio', score: data?.subscores_10.wfr ?? null },
    { label: 'Protein Sufficiency', score: data?.subscores_10.ps ?? null },
    { label: 'Fiber', score: data?.subscores_10.fp ?? null },
    { label: 'Added Sugar', score: data?.subscores_10.as ?? null },
    { label: 'Phytonutrient Composition', score: data?.subscores_10.pnd ?? null },
    { label: 'Omega Balance', score: data?.subscores_10.ob ?? null },
    { label: 'Micronutrient Coverage', score: data?.subscores_10.mnc ?? null },
  ];

  const total = factors.length + 1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Track scroll position → active block + edge state for the arrow controls.
  const syncScrollState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const maxScroll = container.scrollWidth - container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 4);
    setCanScrollRight(container.scrollLeft < maxScroll - 4);
    const firstCard = container.children[0] as HTMLElement | undefined;
    const cardWidth = firstCard?.offsetWidth ?? 176;
    setActiveIndex(Math.min(total - 1, Math.round(container.scrollLeft / cardWidth)));
  }, [total]);

  useEffect(() => {
    syncScrollState();
  }, [syncScrollState, isLoading]);

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(index, total - 1));
    const card = container.children[clamped] as HTMLElement | undefined;
    if (!card) return;
    container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' });
  }, [total]);

  return (
    <section className="w-full max-w-[750px] mx-auto">
      <div className="mb-3">
        <h2 className="text-xl font-semibold text-white antialiased">
          Nutrition Density So Far Today
        </h2>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/25 bg-transparent">
        <div
          ref={scrollRef}
          onScroll={syncScrollState}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 py-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-44 shrink-0 snap-start flex-col items-center justify-center border-r border-white/25 px-5 py-6 text-center text-white">
            <p className="whitespace-nowrap text-xs text-white/70 antialiased">
              Overall Score
            </p>
            <span className="mt-2 block whitespace-nowrap text-3xl font-semibold leading-none">
              {isLoading ? '...' : overallScore ?? 'n/a'}
            </span>
          </div>
          {factors.map((factor) => (
            <div
              key={factor.label}
              className="flex w-44 shrink-0 snap-start flex-col items-center justify-center border-r border-white/25 px-5 py-6 text-center last:border-r-0"
              title={`${factor.label}: ${getSubscoreStatus(factor.score, hasLoggedNutrition)}`}
            >
              <p className="whitespace-nowrap text-xs text-white/70 antialiased">{factor.label}</p>
              <p className="mt-2 whitespace-nowrap text-3xl font-semibold leading-none text-white antialiased">
                {isLoading ? 'Pending' : getSubscoreStatus(factor.score, hasLoggedNutrition)}
              </p>
            </div>
          ))}
        </div>
      </div>
      {total > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={!canScrollLeft}
            aria-label="Previous metric"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex justify-center gap-2">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to metric ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/55'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={!canScrollRight}
            aria-label="Next metric"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}

const quickEntryItems = [
  { label: 'Log Meal', href: `${APP_ROUTES.logNew}?tab=food`, accent: 'bg-[#f1eaa8] text-black/60' },
  { label: 'Hydration', href: `${APP_ROUTES.logNew}?tab=water`, accent: 'bg-[#9ccbdd] text-black/60' },
  { label: 'Mood', href: `${APP_ROUTES.logNew}?tab=mood`, accent: 'bg-[#cee5a8] text-black/60' },
  { label: 'Movement', href: `${APP_ROUTES.logNew}?tab=movement`, accent: 'bg-[#bfc2e1] text-black/60' },
  { label: 'More', href: APP_ROUTES.logNew, accent: 'bg-[#666663] text-white/70' },
];

function QuickEntryModule() {
  return (
    <section className="w-full max-w-[750px] mx-auto">
      <p className="text-sm mb-[5px]font-semibold text-brand-50 antialiased">
        Quick Entry
      </p>
      <h2 className="text-xl font-semibold text-white antialiased">What would you like to do?</h2>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-6">
        {quickEntryItems.map((item) => (
          <Link key={item.label} href={item.href} className="group flex flex-col items-center gap-2">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-[1.03] sm:h-16 sm:w-16 ${item.accent}`}
              aria-hidden
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <span className="text-center text-[10px] font-medium text-white/75 antialiased sm:text-xs">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

interface PrepPantryView {
  headline: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  metrics: Array<{ label: string; value: number }> | null;
  blockerNote: string | null;
}

function derivePrepPantryView(
  state: PantryReadinessLoadState,
  summary: PantryReadinessSummary | null,
  fallbackGroceryHref: string,
): PrepPantryView {
  const managePantry = {
    secondaryLabel: PANTRY_READINESS_COPY.managePantry,
    secondaryHref: APP_ROUTES.pantry,
  };

  // Soft fallback while loading or if readiness is unavailable — never break.
  if (state !== 'ready' || !summary) {
    return {
      headline: 'Prep & Pantry',
      body: 'Review your plan and grocery list, and keep on-hand items saved so future lists are easier to execute.',
      primaryLabel:
        fallbackGroceryHref === APP_ROUTES.plans
          ? PANTRY_READINESS_COPY.openPlans
          : PANTRY_READINESS_COPY.openGrocery,
      primaryHref: fallbackGroceryHref,
      ...managePantry,
      metrics: null,
      blockerNote: null,
    };
  }

  const groceryHref = readinessGroceryHref(summary) ?? fallbackGroceryHref;
  const planLabel = summary.active_plan?.title?.trim() || 'your active plan';

  if (summary.state === 'no_plan') {
    return {
      headline: 'Build your pantry foundation',
      body: 'Start a plan to see how your saved Pantry affects upcoming grocery lists.',
      primaryLabel: PANTRY_READINESS_COPY.openPlans,
      primaryHref: APP_ROUTES.plans,
      ...managePantry,
      metrics: null,
      blockerNote: null,
    };
  }

  if (summary.state === 'no_grocery_list') {
    return {
      headline: PANTRY_READINESS_COPY.noActiveGroceryList,
      body: `Generate or open a grocery list for ${planLabel} to compare it against your Pantry.`,
      primaryLabel: readinessGroceryHref(summary)
        ? PANTRY_READINESS_COPY.openGrocery
        : PANTRY_READINESS_COPY.openPlans,
      primaryHref: readinessGroceryHref(summary) ?? APP_ROUTES.plans,
      ...managePantry,
      metrics: null,
      blockerNote: null,
    };
  }

  if (summary.state === 'no_pantry') {
    return {
      headline: 'Add items you already have',
      body: 'Saving on-hand Pantry items lets safe matches reduce what you still need to buy.',
      primaryLabel: PANTRY_READINESS_COPY.addPantryItem,
      primaryHref: APP_ROUTES.pantry,
      secondaryLabel: PANTRY_READINESS_COPY.openGrocery,
      secondaryHref: groceryHref,
      metrics: null,
      blockerNote: null,
    };
  }

  // state === 'has_grocery'
  const coverage = summary.coverage;
  const hasBlockers = readinessHasBlockers(coverage);
  const needsReview = coverage
    ? coverage.rows_unit_or_amount_review + coverage.rows_unresolved_identity
    : 0;

  return {
    headline: 'Review grocery readiness',
    body: `See how your Pantry affects the grocery list for ${planLabel}. Required amounts stay primary; deduction only applies on safe identity and unit matches.`,
    primaryLabel: PANTRY_READINESS_COPY.reviewGrocery,
    primaryHref: groceryHref,
    ...managePantry,
    metrics: coverage
      ? [
          { label: PANTRY_READINESS_COPY.coveredByPantry, value: coverage.rows_covered_full },
          { label: PANTRY_READINESS_COPY.stillToBuy, value: coverage.rows_to_buy },
          { label: PANTRY_READINESS_COPY.needsReview, value: needsReview },
        ]
      : null,
    blockerNote: hasBlockers
      ? 'Some grocery rows need review before Pantry can apply.'
      : null,
  };
}

function PrepPantryModule({ fallbackGroceryHref }: { fallbackGroceryHref: string }) {
  const { summary, state } = usePantryReadiness();
  const view = derivePrepPantryView(state, summary, fallbackGroceryHref);

  return (
    <section className="w-full max-w-[750px] mx-auto">
      <div className="relative isolate min-h-[150px] overflow-hidden rounded-[24px] bg-brand-800 shadow-large sm:min-h-[180px]">
        <Image
          src={PREP_PANTRY_BG}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 750px"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-brand-900/75 to-black/40" />
        <div className="relative z-10 p-5 sm:p-6">
          <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/80">
            Prep & Pantry
          </span>
          <h2 className="mt-4 max-w-md text-2xl font-semibold leading-tight text-white antialiased sm:text-3xl">
            {view.headline}
          </h2>
          <p className="mt-1 max-w-md text-sm text-white/75 antialiased">{view.body}</p>

          {view.metrics && (
            <div className="mt-4 grid max-w-md grid-cols-3 gap-2">
              {view.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-white/15 bg-black/25 px-3 py-2 backdrop-blur-sm"
                >
                  <p className="text-2xl font-semibold leading-none text-white antialiased">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-[11px] font-medium leading-tight text-white/65 antialiased">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          {view.blockerNote && (
            <p className="mt-3 max-w-md text-xs text-amber-100/90 antialiased">{view.blockerNote}</p>
          )}

          <Link
            href={view.primaryHref}
            className="mt-5 inline-flex w-full justify-center rounded-full bg-[#d7ecff] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
          >
            {view.primaryLabel}
          </Link>
          <Link
            href={view.secondaryHref}
            className="mt-2 inline-flex w-full justify-center rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-brand-50/85 transition-colors hover:bg-white/[0.1] hover:text-brand-50"
          >
            {view.secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

function HomeTemplateCards() {
  const cards = [
    {
      eyebrow: 'Your Default Path',
      headline: 'Build Your Foundation',
      progress: 'Step 2 of 6 • 33%',
      body: 'Create daily consistency with meals, habits and awareness.',
      href: APP_ROUTES.programs,
      image: BASELINE_CARD_IMAGE,
      showChevron: true,
      imageOnRightMobile: false,
    },
    {
      eyebrow: 'Why it matters today',
      headline: 'Protein at breakfast supports steady energy and focus',
      progress: null,
      body: 'See why →',
      href: APP_ROUTES.log,
      image: CASE_STUDY_CARD_IMAGE,
      showChevron: false,
      imageOnRightMobile: true,
    },
  ];

  return (
    <section className="grid w-full max-w-[750px] mx-auto grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.headline}
          href={card.href}
          className={`flex items-center gap-3 rounded-2xl bg-brand-50 p-3 text-black shadow-large transition-transform hover:scale-[1.01] sm:flex-col sm:items-stretch sm:gap-0 ${
            card.imageOnRightMobile ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:h-auto sm:w-full sm:aspect-[5/2]">
            <Image
              src={card.image}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 112px, 325px"
            />
          </div>
          <div className="flex flex-1 items-center justify-between gap-2 px-1 sm:mt-3 sm:px-2 sm:pb-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-black/40">{card.eyebrow}</p>
              <h3 className="mt-1 text-base font-semibold leading-tight text-black antialiased">{card.headline}</h3>
              {card.progress && (
                <p className="mt-1 text-sm font-medium text-black antialiased">{card.progress}</p>
              )}
              <p className="mt-1 text-xs leading-relaxed text-black/55 antialiased">{card.body}</p>
            </div>
            {card.showChevron && (
              <span className="shrink-0 text-black/35" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            )}
          </div>
        </Link>
      ))}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function JournalHomePage() {
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
  const [firstName, setFirstName] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const fetchedRef = useRef(false);
  const nds = useNDS({ dateLocal: todayLocalKey() });

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const today = new Date();
        const results = await journalService.listEntriesByDay(today);
        const todayDk = toDateKey(today);
        const todayItems = results.filter(
          (e: JournalEntry) => toDateKey(e.timestamp) === todayDk
        );
        setTodayEntries(todayItems);
      } catch (err) {
        console.warn('[JournalHome] Failed to load today data:', err);
        setTodayEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/journal/profile');
        if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
        const data = await res.json();
        const profile = data.profile as Record<string, unknown> | undefined;
        setMealSchedule(normalizeMealSchedule(profile?.meal_schedule));
        setFirstName(typeof profile?.first_name === 'string' && profile.first_name.trim() ? profile.first_name.trim() : null);
      } catch (err) {
        console.warn('[JournalHome] Failed to load meal schedule:', err);
        setMealSchedule(defaultMealSchedule());
      } finally {
        setScheduleLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const plans = await planService.list();
        const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
        setActivePlan(active);
        if (active) {
          const detail = await planService.getDetail(active.id);
          setPlanDays(detail.days);
        }
      } catch (err) {
        console.warn('[JournalHome] Failed to load plan route context:', err);
        setActivePlan(null);
        setPlanDays([]);
      }
    })();
  }, []);

  const enabledMealSlots = useMemo(() => getEnabledMealSlots(mealSchedule), [mealSchedule]);
  const dayPlanHref = useMemo(() => {
    if (!activePlan) return APP_ROUTES.plans;
    const today = todayLocalKey();
    const hasToday = planDays.some((day) => day.date_local === today);
    if (!hasToday) return APP_ROUTES.plans;
    return `${APP_ROUTE_BUILDERS.planDay(today)}?planId=${encodeURIComponent(activePlan.id)}`;
  }, [activePlan, planDays]);
  const groceryHref = activePlan ? APP_ROUTE_BUILDERS.planGrocery(activePlan.id) : APP_ROUTES.plans;

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* ── Layer 0: Hero ─────────────────────────────────────────── */}
        <StackedPageHero className="overflow-hidden bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
          <div className="relative z-10 mx-auto w-full max-w-[750px] px-5 pb-16 pt-[70px] sm:pb-[4.5rem] sm:pt-[4.5rem] min-h-[200px]">
            <div className="text-center">
              <h1 className="mx-auto max-w-[520px] text-5xl font-semibold text-white antialiased sm:text-7xl">
                {getGreeting()}
                {firstName ? (
                  <>
                    ,<br />
                    {firstName}
                  </>
                ) : (
                  '.'
                )}
              </h1>
              <p className="mx-auto mt-2 max-w-md text-base font-light leading-relaxed text-white/100 antialiased">
                Let&apos;s set you up for a strong day.
              </p>
            </div>
          </div>
        </StackedPageHero>

        <StackedPageSection layer={1} className="bg-[#16110d]" contentClassName="max-w-none">
          <TodayRhythmModule
            slots={enabledMealSlots}
            todayEntries={todayEntries}
            loading={scheduleLoading || loading}
            dayPlanHref={dayPlanHref}
          />
        </StackedPageSection>

        <StackedPageSection layer={2} className="bg-[#16110d]" contentClassName="max-w-none">
          <NutritionDensityModule data={nds.data} isLoading={nds.isLoading} />
        </StackedPageSection>

        <StackedPageSection layer={3} className="bg-[#16110d]" contentClassName="max-w-none">
          <QuickEntryModule />
        </StackedPageSection>

        <StackedPageSection layer={4} className="#16110d" contentClassName="max-w-none">
          <PrepPantryModule fallbackGroceryHref={groceryHref} />
        </StackedPageSection>

        <StackedPageSection layer={5} className="#16110d pb-10" contentClassName="max-w-none">
          <HomeTemplateCards />
        </StackedPageSection>
      </div>

      <JournalFooterNav />
    </div>
  );
}
