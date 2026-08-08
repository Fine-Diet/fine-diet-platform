'use client';

/**
 * Plans Home presentation composition.
 *
 * Meal Guidance + planning rail + Pantry Readiness. Non-production fixtures
 * drive visual review via ?fixture= / preferFixtures; canonical /app/plans
 * loads the live current-plan adapter (no fixture fallback).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { MealGuidanceModule } from '@/components/plans/home/MealGuidanceModule';
import { PantryReadinessModule } from '@/components/plans/home/PantryReadinessModule';
import { PlanningRouteRail } from '@/components/plans/home/PlanningRouteRail';
import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { selectCurrentPlan } from '@/lib/plans/currentPlan';
import {
  buildPlansHomeGuidance,
  resolveDefaultPlansHomeSelectedDate,
} from '@/lib/plans/home/buildGuidance';
import {
  getPlansHomeFixture,
  parsePlansHomeFixtureId,
  plansHomeFixturesAllowed,
} from '@/lib/plans/home/fixtures';
import type {
  PlansHomeViewModel,
  PlansLogMealHandler,
  PlansMealGuidanceRow,
  PlansMealGuidanceViewModel,
  PlansPantryReadinessViewModel,
} from '@/lib/plans/home/types';
import { planService } from '@/lib/plans/planService';
import {
  readinessGroceryHref,
  usePantryReadiness,
} from '@/lib/plans/usePantryReadiness';
import type { Plan, PlanDay, PlannedMeal, PlanSlot } from '@/lib/plans/types';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  buildPlansHomeEmptyLogHref,
  buildPlansHomeLogHref,
  buildPlansHomeUpdateHref,
} from '@/lib/plans/home/plansHomeActionRoutes';

function liveLoadingModel(selectedDate: string): PlansHomeViewModel {
  return {
    fixtureId: 'live',
    guidance: {
      status: 'loading',
      selectedDate,
      days: [],
      rows: [],
      planId: null,
    },
    pantry: {
      status: 'loading',
      columns: [],
      managePantryHref: APP_ROUTES.foodPantry,
      groceryListId: null,
    },
  };
}

function resolveFixtureModel(
  fixtureQuery: unknown,
  preferFixtures: boolean,
): PlansHomeViewModel | null {
  if (!plansHomeFixturesAllowed()) return null;
  const fixtureId = parsePlansHomeFixtureId(fixtureQuery);
  if (fixtureId) return getPlansHomeFixture(fixtureId);
  if (preferFixtures) return getPlansHomeFixture('populated');
  return null;
}

function withSelectedDate(
  guidance: PlansMealGuidanceViewModel,
  selectedDate: string,
): PlansMealGuidanceViewModel {
  return { ...guidance, selectedDate };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapLivePantry(
  state: 'loading' | 'ready' | 'error',
  summary: ReturnType<typeof usePantryReadiness>['summary'],
): PlansPantryReadinessViewModel {
  if (state === 'loading') {
    return {
      status: 'loading',
      columns: [],
      managePantryHref: APP_ROUTES.foodPantry,
      groceryListId: null,
    };
  }
  if (state === 'error') {
    return {
      status: 'error',
      columns: [],
      managePantryHref: APP_ROUTES.foodPantry,
      groceryListId: null,
      errorMessage: 'Could not load Pantry readiness.',
    };
  }
  if (!summary || summary.state === 'no_plan') {
    return {
      status: 'empty',
      columns: [],
      managePantryHref: APP_ROUTES.foodPantry,
      groceryListId: null,
      message: 'Generate a plan to connect pantry readiness.',
    };
  }
  if (summary.state === 'no_grocery_list' || !summary.list_context) {
    return {
      status: 'no_list',
      columns: [],
      managePantryHref: APP_ROUTES.foodPantry,
      groceryListId: null,
      message: 'No active grocery list for this plan yet.',
    };
  }

  const coverage = summary.coverage;
  const groceryHref =
    readinessGroceryHref(summary) ?? APP_ROUTES.foodGroceries;

  return {
    status: 'populated',
    groceryListId: null,
    managePantryHref: APP_ROUTES.foodPantry,
    columns: [
      {
        id: 'essentials',
        title: 'Covered',
        primary: coverage ? String(coverage.rows_covered_full) : '–',
        lines: [
          coverage
            ? `${coverage.rows_covered_full} fully covered`
            : 'Coverage pending',
          coverage ? `${coverage.rows_partial} partial` : '',
        ].filter(Boolean),
        href: APP_ROUTES.foodPantry,
      },
      {
        id: 'perishables',
        title: 'Still to buy',
        primary: coverage ? String(coverage.rows_to_buy) : '–',
        lines: [
          coverage ? `${coverage.rows_to_buy} to buy` : 'Counts pending',
          `${summary.pantry_items_saved} pantry items saved`,
        ],
        href: APP_ROUTES.foodPantry,
      },
      {
        id: 'on_the_list',
        title: 'On The List',
        primary: 'Open grocery',
        lines: [
          coverage &&
          (coverage.rows_unresolved_identity > 0 ||
            coverage.rows_unit_or_amount_review > 0)
            ? 'Some rows need review'
            : 'Ready to shop',
        ],
        href: groceryHref,
      },
    ],
  };
}

type LivePlanCache = {
  plan: Plan | null;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
  scheduleSlots: ReturnType<typeof getEnabledMealSlots>;
  hasSchedule: boolean;
  errorMessage?: string;
};

export function PlansHomeView({
  hideFooter = false,
  preferFixtures = false,
}: {
  /** Dev preview hides footer so it does not obscure prototype comparison. */
  hideFooter?: boolean;
  /** Dev preview may force fixtures without ?fixture=. Canonical /app/plans must not. */
  preferFixtures?: boolean;
}) {
  const router = useRouter();
  const fixtureModel = useMemo(
    () => resolveFixtureModel(router.query.fixture, preferFixtures),
    [router.query.fixture, preferFixtures],
  );
  const isLive = fixtureModel === null;

  const queryDate =
    typeof router.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(router.query.date)
      ? router.query.date
      : null;

  const [selectedDate, setSelectedDate] = useState(
    queryDate ?? fixtureModel?.guidance.selectedDate ?? todayKey(),
  );

  const [liveCache, setLiveCache] = useState<LivePlanCache | null>(null);
  const [liveLoadState, setLiveLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const liveDateHydratedRef = useRef(false);
  const [dateInPlanRange, setDateInPlanRange] = useState(true);

  const pantryHook = usePantryReadiness();

  useEffect(() => {
    if (queryDate) {
      setSelectedDate(queryDate);
      return;
    }
    if (fixtureModel) {
      setSelectedDate(fixtureModel.guidance.selectedDate);
    }
  }, [queryDate, fixtureModel, fixtureModel?.guidance.selectedDate]);

  // Default date: today when inside plan coverage; never silently jump to an
  // expired plan's start_date. Explicit ?date always wins (handled above).
  useEffect(() => {
    if (!isLive || liveLoadState !== 'ready' || !liveCache) return;
    if (liveDateHydratedRef.current && !queryDate) return;

    const resolved = resolveDefaultPlansHomeSelectedDate({
      today: todayKey(),
      plan: liveCache.plan,
      days: liveCache.days,
      explicitDate: queryDate,
    });

    if (!queryDate) {
      if (!liveDateHydratedRef.current) {
        liveDateHydratedRef.current = true;
        setSelectedDate(resolved.selectedDate);
      }
    } else {
      liveDateHydratedRef.current = true;
    }
    setDateInPlanRange(resolved.inRange);
  }, [isLive, liveLoadState, liveCache, queryDate]);

  // When user picks a date from the week strip, recompute in-range against the
  // loaded plan coverage (explicit historical dates may be in-range).
  useEffect(() => {
    if (!isLive || !liveCache?.plan || !selectedDate) return;
    const resolved = resolveDefaultPlansHomeSelectedDate({
      today: todayKey(),
      plan: liveCache.plan,
      days: liveCache.days,
      explicitDate: selectedDate,
    });
    setDateInPlanRange(resolved.inRange);
  }, [isLive, liveCache, selectedDate]);

  useEffect(() => {
    if (!isLive || !router.isReady) return;
    let cancelled = false;

    (async () => {
      setLiveLoadState('loading');
      try {
        const [plans, profileRes] = await Promise.all([
          planService.list(),
          fetch('/api/journal/profile', { credentials: 'include' }).then(
            async (res) => {
              if (!res.ok) return null;
              return (await res.json()) as { profile?: { meal_schedule?: unknown } };
            },
          ),
        ]);

        const scheduleRaw = profileRes?.profile?.meal_schedule ?? null;
        const scheduleSlots = getEnabledMealSlots(scheduleRaw);
        const hasSchedule = scheduleSlots.length > 0;
        const current = selectCurrentPlan(plans);

        if (!current) {
          if (cancelled) return;
          setLiveCache({
            plan: null,
            days: [],
            slots: [],
            meals: [],
            scheduleSlots,
            hasSchedule,
          });
          setLiveLoadState('ready');
          return;
        }

        const detail = await planService.getDetail(current.id);
        if (cancelled) return;
        setLiveCache({
          plan: detail.plan,
          days: detail.days,
          slots: detail.slots,
          meals: detail.meals,
          scheduleSlots,
          hasSchedule,
        });
        setLiveLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setLiveCache({
          plan: null,
          days: [],
          slots: [],
          meals: [],
          scheduleSlots: [],
          hasSchedule: false,
          errorMessage:
            err instanceof Error ? err.message : 'Failed to load Plans Home.',
        });
        setLiveLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLive, router.isReady]);

  const liveGuidance = useMemo((): PlansMealGuidanceViewModel => {
    if (!isLive) {
      return fixtureModel!.guidance;
    }
    if (liveLoadState === 'loading' || !liveCache) {
      return liveLoadingModel(selectedDate).guidance;
    }
    return buildPlansHomeGuidance({
      plan: liveCache.plan,
      days: liveCache.days,
      slots: liveCache.slots,
      meals: liveCache.meals,
      scheduleSlots: liveCache.scheduleSlots,
      selectedDate,
      hasSchedule: liveCache.hasSchedule,
      dateInPlanRange,
      errorMessage:
        liveLoadState === 'error'
          ? liveCache.errorMessage ?? 'Failed to load Plans Home.'
          : undefined,
    });
  }, [fixtureModel, isLive, liveCache, liveLoadState, selectedDate, dateInPlanRange]);

  const guidance = useMemo(
    () => withSelectedDate(liveGuidance, selectedDate),
    [liveGuidance, selectedDate],
  );

  const pantryModel = useMemo((): PlansPantryReadinessViewModel => {
    if (fixtureModel) return fixtureModel.pantry;
    return mapLivePantry(pantryHook.state, pantryHook.summary);
  }, [fixtureModel, pantryHook.state, pantryHook.summary]);

  const dailyHref = useMemo(() => {
    if (guidance.planId) {
      return APP_ROUTE_BUILDERS.planDayWithPlan(selectedDate, guidance.planId);
    }
    if (selectedDate) return APP_ROUTE_BUILDERS.planDay(selectedDate);
    return APP_ROUTES.todayPlan;
  }, [guidance.planId, selectedDate]);

  const handleSelectDate = useCallback(
    (date: string) => {
      setSelectedDate(date);
      const nextQuery = { ...router.query, date };
      void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
        shallow: true,
      });
    },
    [router],
  );

  const handleLog = useCallback<PlansLogMealHandler>(
    async (row) => {
      if (row.state === 'empty') {
        await router.push(buildPlansHomeEmptyLogHref({ row, selectedDate }));
        return { ok: true };
      }

      if (isLive) {
        const href = buildPlansHomeLogHref({ row, selectedDate });
        if (!href) {
          return { ok: false, errorMessage: 'No planned meal to log for this slot.' };
        }
        await router.push(href);
        return { ok: true };
      }

      if (!plansHomeFixturesAllowed()) {
        return { ok: false, errorMessage: 'Live meal execution is not attached yet.' };
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
      if (fixtureModel?.fixtureId === 'action_error') {
        return { ok: false, errorMessage: 'Could not update this meal. Try again.' };
      }
      return { ok: true };
    },
    [fixtureModel?.fixtureId, isLive, router, selectedDate],
  );

  const handlePlan = useCallback(
    (row: PlansMealGuidanceRow) => {
      const base = guidance.planId
        ? APP_ROUTE_BUILDERS.planDayWithPlan(selectedDate, guidance.planId)
        : APP_ROUTE_BUILDERS.planDay(selectedDate);
      if (row.state === 'empty') {
        const joiner = base.includes('?') ? '&' : '?';
        void router.push(`${base}${joiner}createSlot=${encodeURIComponent(row.slotKey)}`);
        return;
      }
      void router.push(base);
    },
    [guidance.planId, router, selectedDate],
  );

  const handleUpdate = useCallback(
    (row: PlansMealGuidanceRow) => {
      if (!row.mealId) {
        handlePlan(row);
        return;
      }
      const href = buildPlansHomeUpdateHref({
        row,
        selectedDate,
        planId: guidance.planId,
      });
      if (href) void router.push(href);
    },
    [guidance.planId, handlePlan, router, selectedDate],
  );

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className={`flex-1 overflow-x-hidden overflow-y-auto ${hideFooter ? 'pb-10' : 'pb-28'}`}>
        <div
          className="relative flex min-h-[90vh] flex-col bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]"
        >
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <MealGuidanceModule
              model={guidance}
              onSelectDate={handleSelectDate}
              onLog={handleLog}
              onPlan={handlePlan}
              onUpdate={handleUpdate}
            />
          </div>
          <div className="shrink-0">
            <PlanningRouteRail dailyHref={dailyHref} />
          </div>
        </div>
        <PantryReadinessModule model={pantryModel} />
      </main>
      {!hideFooter && <JournalFooterNav />}
    </div>
  );
}
