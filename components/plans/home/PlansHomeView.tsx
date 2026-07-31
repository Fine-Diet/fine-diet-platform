'use client';

/**
 * Plans Home presentation composition.
 *
 * Meal Guidance + planning rail + Pantry Readiness. Non-production fixtures
 * drive the first visual review; live adapters attach behind the same contracts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { MealGuidanceModule } from '@/components/plans/home/MealGuidanceModule';
import { PantryReadinessModule } from '@/components/plans/home/PantryReadinessModule';
import { PlanningRouteRail } from '@/components/plans/home/PlanningRouteRail';
import {
  getPlansHomeFixture,
  parsePlansHomeFixtureId,
  plansHomeFixturesAllowed,
  PLANS_HOME_FIXTURE_WEEK_START,
} from '@/lib/plans/home/fixtures';
import type {
  PlansHomeViewModel,
  PlansLogMealHandler,
  PlansMealGuidanceRow,
  PlansMealGuidanceViewModel,
} from '@/lib/plans/home/types';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

function resolveViewModel(fixtureQuery: unknown): PlansHomeViewModel {
  if (!plansHomeFixturesAllowed()) {
    return {
      fixtureId: 'live',
      guidance: {
        status: 'no_active_plan',
        selectedDate: new Date().toISOString().slice(0, 10),
        days: [],
        rows: [],
        planId: null,
      },
      pantry: {
        status: 'empty',
        columns: [],
        managePantryHref: APP_ROUTES.foodPantry,
        groceryListId: null,
        message: 'Pantry readiness attaches after visual approval.',
      },
    };
  }
  const fixtureId = parsePlansHomeFixtureId(fixtureQuery) ?? 'populated';
  return getPlansHomeFixture(fixtureId);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withSelectedDate(
  guidance: PlansMealGuidanceViewModel,
  selectedDate: string,
): PlansMealGuidanceViewModel {
  return { ...guidance, selectedDate };
}

export function PlansHomeView({
  hideFooter = false,
}: {
  /** Dev preview hides footer so it does not obscure prototype comparison. */
  hideFooter?: boolean;
}) {
  const router = useRouter();
  const baseModel = useMemo(
    () => resolveViewModel(router.query.fixture),
    [router.query.fixture],
  );

  const queryDate =
    typeof router.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(router.query.date)
      ? router.query.date
      : null;

  const [selectedDate, setSelectedDate] = useState(
    queryDate ?? baseModel.guidance.selectedDate ?? PLANS_HOME_FIXTURE_WEEK_START,
  );

  useEffect(() => {
    if (queryDate) {
      setSelectedDate(queryDate);
      return;
    }
    setSelectedDate(baseModel.guidance.selectedDate);
  }, [queryDate, baseModel.guidance.selectedDate, baseModel.fixtureId]);

  const guidance = useMemo(
    () => withSelectedDate(baseModel.guidance, selectedDate),
    [baseModel.guidance, selectedDate],
  );

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
        const params = new URLSearchParams({
          tab: 'food',
          date: selectedDate,
          time: row.targetTimeValue,
          mealSlot: row.slotKey,
          redirect: APP_ROUTES.plans,
        });
        await router.push(`${APP_ROUTES.logNew}?${params.toString()}`);
        return { ok: true };
      }

      if (!plansHomeFixturesAllowed()) {
        return { ok: false, errorMessage: 'Live meal execution is not attached yet.' };
      }

      await sleep(500);
      if (baseModel.fixtureId === 'action_error') {
        return { ok: false, errorMessage: 'Could not update this meal. Try again.' };
      }
      // Presentation fixture: mutate local visual state is out of scope; success toast path only.
      return { ok: true };
    },
    [baseModel.fixtureId, router, selectedDate],
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
      // Existing meal: open day editor without creating a duplicate.
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
      const base = guidance.planId
        ? APP_ROUTE_BUILDERS.planDayWithPlan(selectedDate, guidance.planId)
        : APP_ROUTE_BUILDERS.planDay(selectedDate);
      const joiner = base.includes('?') ? '&' : '?';
      void router.push(`${base}${joiner}editMeal=${encodeURIComponent(row.mealId)}`);
    },
    [guidance.planId, handlePlan, router, selectedDate],
  );

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className={`flex-1 overflow-x-hidden overflow-y-auto ${hideFooter ? 'pb-10' : 'pb-28'}`}>
        <MealGuidanceModule
          model={guidance}
          onSelectDate={handleSelectDate}
          onLog={handleLog}
          onPlan={handlePlan}
          onUpdate={handleUpdate}
        />
        <PlanningRouteRail dailyHref={dailyHref} />
        <PantryReadinessModule model={baseModel.pantry} />
      </main>
      {!hideFooter && <JournalFooterNav />}
    </div>
  );
}
