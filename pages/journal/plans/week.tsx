'use client';

/**
 * /journal/plans/week — Weekly Planning Command Center (Packet A)
 *
 * Restores a dedicated weekly management surface. The rebuilt Plans landing
 * page (/app/plans) became an overview/launch surface, which left the day
 * editor's "← Week view" link and the weekly planning experience without a
 * real home. This page is that home: weekly summary, projected NDS, a
 * seven-day preview, editing entry points, and reusable planning controls.
 *
 * Data loading mirrors the Plans landing page (active plan detail + profile
 * meal schedule + pantry readiness) and adds reusable templates / week
 * patterns. All mutations reuse the existing planService endpoints.
 *
 * Legacy compatibility: reachable at both /app/plans/week and
 * /journal/plans/week (the /app route re-exports this module).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { WeeklyPlanningCommandCenter } from '@/components/journal/plans/WeeklyPlanningCommandCenter';
import type {
  DecisionLoadTone,
  WeeklyCoverageSummary,
  WeeklyDecisionLoad,
  WeeklyExecutionSummary,
  WeeklyPantrySnapshot,
} from '@/components/journal/plans/WeeklyPlanningCommandCenter';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlanSlot,
  type PlannedMeal,
  type PlanDayTemplate,
  type PlanWeekPattern,
} from '@/lib/plans';
import {
  PANTRY_READINESS_COPY,
  readinessGroceryHref,
  readinessHasBlockers,
  usePantryReadiness,
} from '@/lib/plans/usePantryReadiness';

type LoadState = 'loading' | 'ready' | 'error';

interface ProfileResponse {
  profile?: {
    meal_schedule?: unknown;
  };
}

const PLANS_PAGE_MAX_WIDTH = 'max-w-[750px]';
const HERO_BG = 'bg-gradient-to-b from-neutral-900 to-brand-700 to-80%';
const ZONE_BG = 'bg-[#1A160F]';

function deriveCoverage(
  weekDays: PlanDay[],
  planSlots: PlanSlot[],
  meals: PlannedMeal[],
): WeeklyCoverageSummary {
  const dayIds = new Set(weekDays.map((day) => day.id));
  const weekSlots = planSlots.filter((slot) => dayIds.has(slot.plan_day_id));
  const weekMeals = meals.filter((meal) => dayIds.has(meal.plan_day_id));
  const totalSlots = weekSlots.length;
  const coveredSlotIds = new Set(
    weekMeals
      .map((meal) => meal.plan_slot_id)
      .filter((id): id is string => Boolean(id)),
  );
  const slotsCovered = weekSlots.filter((slot) => coveredSlotIds.has(slot.id)).length;
  const openSlots = Math.max(0, totalSlots - slotsCovered);
  const percent = totalSlots === 0 ? 0 : Math.round((slotsCovered / totalSlots) * 100);
  return {
    plannedMeals: weekMeals.length,
    openSlots,
    totalSlots,
    percent,
    coverageLabel:
      totalSlots === 0
        ? 'No slots in this plan week yet.'
        : `${slotsCovered} of ${totalSlots} slot${totalSlots === 1 ? '' : 's'} covered.`,
  };
}

function deriveDecisionLoad(coverage: WeeklyCoverageSummary): WeeklyDecisionLoad {
  if (coverage.totalSlots === 0) {
    return { label: '—', tone: 'neutral', description: 'Generate a week to begin planning.' };
  }
  if (coverage.percent >= 66) {
    return {
      label: 'Low',
      tone: 'green',
      description: 'Most nourishment decisions are covered.',
    };
  }
  if (coverage.percent >= 34) {
    return {
      label: 'Moderate',
      tone: 'yellow',
      description: 'Some slots still need your attention.',
    };
  }
  return {
    label: 'High',
    tone: 'red' as DecisionLoadTone,
    description: 'Most slots still need a planned meal.',
  };
}

function deriveExecution(weekDays: PlanDay[], meals: PlannedMeal[]): WeeklyExecutionSummary {
  const dayIds = new Set(weekDays.map((day) => day.id));
  const weekMeals = meals.filter((meal) => dayIds.has(meal.plan_day_id));
  let eaten = 0;
  let skipped = 0;
  let pending = 0;
  for (const meal of weekMeals) {
    if (meal.execution_state === 'eaten') eaten += 1;
    else if (meal.execution_state === 'skipped') skipped += 1;
    else pending += 1;
  }
  return { eaten, skipped, pending, hasState: weekMeals.length > 0 };
}

function buildGroceryRangeHref(plan: Plan | null, weekDays: PlanDay[]): string | null {
  if (!plan || weekDays.length === 0) return null;
  const start = weekDays[0]!.date_local;
  const end = weekDays[weekDays.length - 1]!.date_local;
  const params = new URLSearchParams({ date: start });
  if (end && end !== start) params.set('date_end', end);
  return `${APP_ROUTE_BUILDERS.planGrocery(plan.id)}?${params.toString()}`;
}

export default function JournalPlansWeekPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [planSlots, setPlanSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [hasProfileSchedule, setHasProfileSchedule] = useState(false);
  const [templates, setTemplates] = useState<PlanDayTemplate[]>([]);
  const [weekPatterns, setWeekPatterns] = useState<PlanWeekPattern[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [savingPattern, setSavingPattern] = useState(false);
  const [applyingPatternId, setApplyingPatternId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const { summary: readiness, state: readinessState } = usePantryReadiness();

  const loadActivePlan = useCallback(async (): Promise<Plan | null> => {
    const plans = await planService.list();
    const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
    if (!active) {
      setPlan(null);
      setDays([]);
      setPlanSlots([]);
      setMeals([]);
      return null;
    }
    const detail = await planService.getDetail(active.id);
    setPlan(detail.plan);
    setDays(detail.days);
    setPlanSlots(detail.slots);
    setMeals(detail.meals);
    return detail.plan;
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      setLoadState('loading');
      try {
        const [profileRes, , templateRes, weekPatternRes] = await Promise.all([
          fetch('/api/journal/profile', { credentials: 'include' })
            .then(async (res) => {
              if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
              return (await res.json()) as ProfileResponse;
            })
            .catch(() => null),
          loadActivePlan(),
          planService.listPlanDayTemplates().catch(() => []),
          planService.listPlanWeekPatterns().catch(() => []),
        ]);

        setHasProfileSchedule(Boolean(profileRes?.profile?.meal_schedule));
        setTemplates(templateRes);
        setWeekPatterns(weekPatternRes);
        setLoadState('ready');
      } catch {
        setLoadState('error');
      }
    })();
  }, [loadActivePlan]);

  const weekDays = useMemo(
    () =>
      [...days]
        .sort((a, b) => a.date_local.localeCompare(b.date_local))
        .slice(0, 7),
    [days],
  );

  const mealCountByDay = useMemo(() => {
    const dayIdToDate = new Map(days.map((d) => [d.id, d.date_local]));
    const counts: Record<string, number> = {};
    for (const meal of meals) {
      const date = dayIdToDate.get(meal.plan_day_id);
      if (!date) continue;
      counts[date] = (counts[date] ?? 0) + 1;
    }
    return counts;
  }, [days, meals]);

  const coverage = useMemo(
    () => deriveCoverage(weekDays, planSlots, meals),
    [weekDays, planSlots, meals],
  );
  const decisionLoad = useMemo(() => deriveDecisionLoad(coverage), [coverage]);
  const execution = useMemo(() => deriveExecution(weekDays, meals), [weekDays, meals]);
  const groceryRangeHref = useMemo(
    () => buildGroceryRangeHref(plan, weekDays),
    [plan, weekDays],
  );

  const pantry = useMemo<WeeklyPantrySnapshot>(() => {
    const fallbackHref = groceryRangeHref;
    if (readinessState !== 'ready' || !readiness) {
      return {
        headline: 'Pantry context unavailable',
        body: 'Keep on-hand items saved so grocery lists are easier to execute.',
        blockerNote: null,
        groceryHref: fallbackHref,
      };
    }
    const href = readinessGroceryHref(readiness) ?? fallbackHref;
    if (readiness.state === 'no_plan') {
      return {
        headline: 'No active plan yet',
        body: 'Start a plan to compare grocery needs against your Pantry.',
        blockerNote: null,
        groceryHref: href,
      };
    }
    if (readiness.state === 'no_grocery_list') {
      return {
        headline: PANTRY_READINESS_COPY.noActiveGroceryList,
        body: 'Generate a grocery list to compare it against your Pantry.',
        blockerNote: null,
        groceryHref: href,
      };
    }
    if (readiness.state === 'no_pantry') {
      return {
        headline: 'Add items you already have',
        body: 'Saved Pantry items reduce what you still need to buy.',
        blockerNote: null,
        groceryHref: href,
      };
    }
    const coverageCounts = readiness.coverage;
    return {
      headline: coverageCounts
        ? `${coverageCounts.rows_to_buy} to buy · ${coverageCounts.rows_covered_full} covered`
        : 'Pantry is working for you',
      body: 'Safe canonical matches reduce what you still need to buy.',
      blockerNote: readinessHasBlockers(coverageCounts)
        ? 'Some grocery rows need review before Pantry can apply.'
        : null,
      groceryHref: href,
    };
  }, [readiness, readinessState, groceryRangeHref]);

  const handleSaveWeekPattern = useCallback(async () => {
    if (!plan || days.length === 0) return;
    setSavingPattern(true);
    setActionError(null);
    try {
      const sourcePlanDayIds = [...days]
        .sort((a, b) => a.date_local.localeCompare(b.date_local))
        .map((day) => day.id);
      const pattern = await planService.savePlanWeekPattern({
        plan_id: plan.id,
        source_plan_day_ids: sourcePlanDayIds,
      });
      setWeekPatterns((prev) => [pattern, ...prev.filter((p) => p.id !== pattern.id)]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Save week pattern failed.');
    } finally {
      setSavingPattern(false);
    }
  }, [plan, days]);

  const handleApplyWeekPattern = useCallback(
    async (patternId: string) => {
      const pattern = weekPatterns.find((p) => p.id === patternId) ?? null;
      if (!plan || !pattern) return;
      const sortedDays = [...days].sort((a, b) => a.date_local.localeCompare(b.date_local));
      const startDay = sortedDays[0];
      if (!startDay) return;
      if (pattern.days.length > sortedDays.length) {
        setActionError('This plan does not have enough days for that pattern.');
        return;
      }
      const targetDays = sortedDays.slice(0, pattern.days.length);
      const targetDayIds = new Set(targetDays.map((d) => d.id));
      const existingMealCount = meals.filter((m) => targetDayIds.has(m.plan_day_id)).length;
      if (existingMealCount > 0) {
        const ok = window.confirm(
          `This appends ${pattern.name} across ${targetDays.length} day(s). ` +
            `The target span already has ${existingMealCount} planned meal(s). Continue?`,
        );
        if (!ok) return;
      }

      setApplyingPatternId(patternId);
      setActionError(null);
      try {
        await planService.instantiatePlanWeekPattern(pattern.id, {
          plan_id: plan.id,
          target_start_plan_day_id: startDay.id,
          apply_policy: 'append',
          allow_duplicate_append: existingMealCount > 0,
        });
        await loadActivePlan();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Apply week pattern failed.');
      } finally {
        setApplyingPatternId(null);
      }
    },
    [plan, days, meals, weekPatterns, loadActivePlan],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#000000] text-white">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero className={`overflow-hidden ${HERO_BG}`}>
          <div
            className={`relative z-10 mx-auto flex min-h-[220px] w-full ${PLANS_PAGE_MAX_WIDTH} flex-col items-center justify-center px-6 pb-14 pt-14 text-center sm:min-h-[260px]`}
          >
            <h1 className="max-w-[520px] text-4xl font-semibold tracking-[-0.03em] text-white antialiased sm:text-6xl">
              Your Week
            </h1>
            <p className="mt-4 max-w-md text-sm leading-snug text-white/78 antialiased">
              Preview the week, edit your plan, and reuse what works.
            </p>
          </div>
        </StackedPageHero>

        <StackedPageSection layer={1} className={ZONE_BG} contentClassName="max-w-none">
          <div className={`mx-auto w-full ${PLANS_PAGE_MAX_WIDTH}`}>
            <WeeklyPlanningCommandCenter
              loadState={loadState}
              plan={plan}
              hasProfileSchedule={hasProfileSchedule}
              weekDays={weekDays}
              planSlots={planSlots}
              meals={meals}
              mealCountByDay={mealCountByDay}
              coverage={coverage}
              decisionLoad={decisionLoad}
              execution={execution}
              pantry={pantry}
              templates={templates}
              weekPatterns={weekPatterns}
              groceryRangeHref={pantry.groceryHref ?? groceryRangeHref}
              onSaveWeekPattern={handleSaveWeekPattern}
              savingPattern={savingPattern}
              onApplyWeekPattern={handleApplyWeekPattern}
              applyingPatternId={applyingPatternId}
              actionError={actionError}
            />
          </div>
        </StackedPageSection>
      </div>

      <JournalFooterNav />
    </div>
  );
}
