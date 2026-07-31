'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  type JournalEntry,
} from '@/lib/journal';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { useNDS } from '@/lib/nds/useNDS';
import { planService, type Plan, type PlanDay } from '@/lib/plans';
import { selectCurrentPlan } from '@/lib/plans/currentPlan';
import {
  getCalendarWeekRange,
  resolvePlanDayNavigation,
} from '@/lib/plans/planDateRange';
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
} from '@/lib/plans/types';
import { defaultMealSchedule, normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { TodayRhythm } from '@/components/journal/home/TodayRhythm';
import { NutritionDensityScroller } from '@/components/journal/home/NutritionDensityScroller';
import { QuickEntryRow } from '@/components/journal/home/QuickEntryRow';
import { PrepPantryCard, type PrepPantryView } from '@/components/journal/home/PrepPantryCard';
import { HomeTemplateCards } from '@/components/journal/home/HomeTemplateCards';

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
/*  Presentational modules extracted to components/journal/home/*      */
/*  (Packet 2B-B): TodayRhythm, NutritionDensityScroller, QuickEntryRow, */
/*  PrepPantryCard, HomeTemplateCards. Live data fetching, routing, and */
/*  the PrepPantry data shaping (derivePrepPantryView) stay on this page.*/
/* ------------------------------------------------------------------ */

// ── Helpers ──────────────────────────────────────────────────────────

function todayLocalKey(): string {
  return toDateKey(new Date());
}

function derivePrepPantryView(
  state: PantryReadinessLoadState,
  summary: PantryReadinessSummary | null,
  fallbackGroceryHref: string,
): PrepPantryView {
  const managePantry = {
    secondaryLabel: PANTRY_READINESS_COPY.managePantry,
    secondaryHref: APP_ROUTES.foodPantry,
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
      primaryHref: APP_ROUTES.foodPantry,
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

  return <PrepPantryCard view={view} />;
}

// ── Page ──────────────────────────────────────────────────────────────

export default function JournalHomePage() {
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
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
        const active = selectCurrentPlan(plans);
        setActivePlan(active);
        if (active) {
          const detail = await planService.getDetail(active.id);
          setPlanDays(detail.days);
        } else {
          setPlanDays([]);
        }
      } catch (err) {
        console.warn('[JournalHome] Failed to load plan route context:', err);
        setActivePlan(null);
        setPlanDays([]);
      }
    })();
  }, []);

  const enabledMealSlots = useMemo(() => getEnabledMealSlots(mealSchedule), [mealSchedule]);
  const dayPlanLink = useMemo(
    () =>
      resolvePlanDayNavigation({
        plan: activePlan,
        days: planDays,
        selectedRange: getCalendarWeekRange(),
      }),
    [activePlan, planDays],
  );
  const groceryHref = activePlan ? APP_ROUTE_BUILDERS.planGrocery(activePlan.id) : APP_ROUTES.plans;

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <StackedPageSection layer={1} className="mt-0 bg-[#16110d] pt-[70px] sm:pt-16" contentClassName="max-w-none">
          <TodayRhythm
            slots={enabledMealSlots}
            todayEntries={todayEntries}
            loading={scheduleLoading || loading}
            dayPlanHref={dayPlanLink.href}
            dayPlanCtaLabel={dayPlanLink.label}
          />
        </StackedPageSection>

        <StackedPageSection layer={2} className="bg-[#16110d]" contentClassName="max-w-none">
          <NutritionDensityScroller data={nds.data} isLoading={nds.isLoading} />
        </StackedPageSection>

        <StackedPageSection layer={3} className="bg-[#16110d]" contentClassName="max-w-none">
          <QuickEntryRow />
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
