'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { MealGuidanceModule } from '@/components/plans/home/MealGuidanceModule';
import { PlanningRouteRail } from '@/components/plans/home/PlanningRouteRail';
import { useMealRhythmOverlay } from '@/components/plans/rhythm/MealRhythmOverlayProvider';
import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import { buildPlansHomeGuidance } from '@/lib/plans/home/buildGuidance';
import {
  getPlansHomeFixture,
  parsePlansHomeFixtureId,
  plansHomeFixturesAllowed,
} from '@/lib/plans/home/fixtures';
import { buildPlansHomeLogHref } from '@/lib/plans/home/plansHomeActionRoutes';
import { resolvePlansHomeReadPlanId } from '@/lib/plans/home/planningTarget';
import type {
  PlansHomeViewModel,
  PlansLogMealHandler,
  PlansMealGuidanceRow,
  PlansMealGuidanceViewModel,
} from '@/lib/plans/home/types';
import { planService } from '@/lib/plans/planService';
import type { Plan, PlanDay, PlannedMeal, PlanSlot } from '@/lib/plans/types';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

type LivePlanCache = {
  plan: Plan | null;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
  scheduleSlots: ReturnType<typeof getEnabledMealSlots>;
  hasSchedule: boolean;
  dailyCalorieGoal: number | null;
  errorMessage?: string;
};

function localTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftMonthDateKey(dateKey: string, delta: -1 | 1): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const targetMonth = month! - 1 + delta;
  const lastDay = new Date(Date.UTC(year!, targetMonth + 1, 0)).getUTCDate();
  const shifted = new Date(Date.UTC(year!, targetMonth, Math.min(day!, lastDay)));
  return shifted.toISOString().slice(0, 10);
}

function loadingGuidance(selectedDate: string): PlansMealGuidanceViewModel {
  return {
    status: 'loading',
    selectedDate,
    days: [],
    rows: [],
    planId: null,
    plannedCount: 0,
    totalCount: 0,
    projectedNds: null,
    plannedCalories: null,
    dailyCalorieGoal: null,
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

export function PlansHomeView({
  hideFooter = false,
  preferFixtures = false,
}: {
  hideFooter?: boolean;
  preferFixtures?: boolean;
}) {
  const router = useRouter();
  const mealRhythmOverlay = useMealRhythmOverlay();
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
    queryDate ?? fixtureModel?.guidance.selectedDate ?? localTodayKey(),
  );
  const [liveCache, setLiveCache] = useState<LivePlanCache | null>(null);
  const [liveLoadState, setLiveLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshToken, setRefreshToken] = useState(0);
  const postSaveReadTargetRef = useRef<{ planId: string; dateLocal: string } | null>(null);

  useEffect(() => {
    if (queryDate) setSelectedDate(queryDate);
    else if (fixtureModel) setSelectedDate(fixtureModel.guidance.selectedDate);
  }, [fixtureModel, queryDate]);

  useEffect(() => {
    if (!isLive || !router.isReady) return;
    let cancelled = false;

    (async () => {
      setLiveLoadState('loading');
      try {
        const [plans, profileResponse, liveSnapshot] = await Promise.all([
          planService.list(),
          fetch('/api/journal/profile', { credentials: 'include' }).then(async (response) => {
            if (!response.ok) return null;
            return (await response.json()) as { profile?: { meal_schedule?: unknown } };
          }),
          planService.getLiveSnapshot().catch(() => null),
        ]);
        const scheduleRaw = profileResponse?.profile?.meal_schedule ?? null;
        const hasSchedule = isUsableSavedMealSchedule(scheduleRaw);
        const scheduleSlots = hasSchedule ? getEnabledMealSlots(scheduleRaw) : [];
        const postSaveTarget =
          postSaveReadTargetRef.current?.dateLocal === selectedDate
            ? postSaveReadTargetRef.current
            : null;
        const readPlanId = resolvePlansHomeReadPlanId({
          plans,
          dateLocal: selectedDate,
          postSaveTarget,
        });
        const dailyCalorieGoal =
          liveSnapshot?.snapshot.targets.daily_calorie_goal ?? null;

        if (!readPlanId) {
          if (!cancelled) {
            setLiveCache({
              plan: null,
              days: [],
              slots: [],
              meals: [],
              scheduleSlots,
              hasSchedule,
              dailyCalorieGoal,
            });
            setLiveLoadState('ready');
          }
          return;
        }

        const detail = await planService.getDetail(readPlanId);
        if (!cancelled) {
          setLiveCache({
            plan: detail.plan,
            days: detail.days,
            slots: detail.slots,
            meals: detail.meals,
            scheduleSlots,
            hasSchedule,
            dailyCalorieGoal,
          });
          if (postSaveReadTargetRef.current === postSaveTarget) {
            postSaveReadTargetRef.current = null;
          }
          setLiveLoadState('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setLiveCache({
            plan: null,
            days: [],
            slots: [],
            meals: [],
            scheduleSlots: [],
            hasSchedule: false,
            dailyCalorieGoal: null,
            errorMessage: error instanceof Error ? error.message : 'Failed to load Plans Home.',
          });
          setLiveLoadState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLive, refreshToken, router.isReady, selectedDate]);

  const guidance = useMemo((): PlansMealGuidanceViewModel => {
    if (fixtureModel) return { ...fixtureModel.guidance, selectedDate };
    if (liveLoadState === 'loading' || !liveCache) return loadingGuidance(selectedDate);
    return buildPlansHomeGuidance({
      plan: liveCache.plan,
      days: liveCache.days,
      slots: liveCache.slots,
      meals: liveCache.meals,
      scheduleSlots: liveCache.scheduleSlots,
      selectedDate,
      hasSchedule: liveCache.hasSchedule,
      dailyCalorieGoal: liveCache.dailyCalorieGoal,
      errorMessage:
        liveLoadState === 'error'
          ? liveCache.errorMessage ?? 'Failed to load Plans Home.'
          : undefined,
    });
  }, [fixtureModel, liveCache, liveLoadState, selectedDate]);

  const selectDate = useCallback((date: string) => {
    setSelectedDate(date);
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, date } },
      undefined,
      { shallow: true },
    );
  }, [router]);

  const handleShiftMonth = useCallback((delta: -1 | 1) => {
    selectDate(shiftMonthDateKey(selectedDate, delta));
  }, [selectDate, selectedDate]);

  const handleLog = useCallback<PlansLogMealHandler>(async (row) => {
    if (!row.mealId || row.state === 'eaten' || row.state === 'skipped') {
      return { ok: false, errorMessage: 'This meal is not available for Quick Log.' };
    }
    if (!isLive) {
      if (fixtureModel?.fixtureId === 'action_error') {
        return { ok: false, errorMessage: 'Could not open this planned meal in Log.' };
      }
      return { ok: true };
    }
    const href = buildPlansHomeLogHref({
      row,
      selectedDate,
      redirect: `/app/plans?date=${selectedDate}`,
    });
    if (!href) return { ok: false, errorMessage: 'No planned meal is available.' };
    await router.push(href);
    return { ok: true };
  }, [fixtureModel?.fixtureId, isLive, router, selectedDate]);

  const handleOpenLog = useCallback((row: PlansMealGuidanceRow) => {
    if (row.journalEntryId) void router.push(APP_ROUTE_BUILDERS.logEntry(row.journalEntryId));
  }, [router]);

  const handleSetupRhythm = useCallback(() => {
    mealRhythmOverlay.openMealRhythm({
      trigger: 'plans',
      onSaved: () => setRefreshToken((value) => value + 1),
    });
  }, [mealRhythmOverlay]);

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className={`flex-1 overflow-x-hidden overflow-y-auto ${hideFooter ? 'pb-10' : 'pb-28'}`}>
        <div className="relative flex min-h-[90vh] flex-col bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]">
          <div className="flex min-h-0 flex-1 flex-col justify-center py-16">
            <MealGuidanceModule
              model={guidance}
              onSelectDate={selectDate}
              onShiftMonth={handleShiftMonth}
              onLog={handleLog}
              onOpenLog={handleOpenLog}
              onResolveTarget={(row) =>
                planService.resolvePlansHomeTarget({
                  dateLocal: selectedDate,
                  slotKey: row.slotKey,
                })
              }
              onCreateSaved={async ({ target }) => {
                if (target.dateLocal) {
                  postSaveReadTargetRef.current = {
                    planId: target.planId,
                    dateLocal: target.dateLocal,
                  };
                }
                setRefreshToken((value) => value + 1);
              }}
              onEditSaved={() => setRefreshToken((value) => value + 1)}
              onSetupRhythm={handleSetupRhythm}
              onRetry={() => setRefreshToken((value) => value + 1)}
            />
          </div>
          <PlanningRouteRail />
        </div>
      </main>
      {!hideFooter && <JournalFooterNav />}
    </div>
  );
}
