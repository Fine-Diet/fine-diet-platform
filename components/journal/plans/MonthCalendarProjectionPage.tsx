'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { MonthCalendarProjection } from '@/components/journal/plans/MonthCalendarProjection';
import {
  applyReusableDayPlan,
  createAndApplyDayPlan,
  saveDatedDayPlan,
} from '@/lib/plans/dayPlanActions';
import {
  blankDayTemplateForDateContext,
  blankDayTemplateFromSlots,
  fetchMonthProjectionData,
} from '@/lib/plans/monthProjectionLoad';
import {
  applyMonthProjectionResult,
  beginMonthProjectionRequest,
  newMonthProjectionSession,
  isCurrentMonthProjectionRequest,
  monthProjectionIdentity,
  shouldRefreshMonthAfterMutation,
} from '@/lib/plans/monthProjectionSession';
import {
  currentCalendarMonthKey,
  getVisibleCalendarDates,
  isCalendarMonthKey,
  resolveCalendarMonthKey,
  shiftCalendarMonthKey,
} from '@/lib/plans/monthProjection';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlanDayTemplate,
  type PlanSlot,
  type PlannedMeal,
} from '@/lib/plans';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

type LoadState = 'loading' | 'ready' | 'error';

export default function MonthCalendarProjectionPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [planSlots, setPlanSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [coveringPlanByDate, setCoveringPlanByDate] = useState<Record<string, Plan>>({});
  const [dayPlans, setDayPlans] = useState<PlanDayTemplate[]>([]);
  const [profileSeedSlots, setProfileSeedSlots] = useState<PlanDayTemplate['slots']>([]);
  const [personId, setPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const projectionSessionRef = useRef(newMonthProjectionSession());

  const requestedMonth = Array.isArray(router.query.month)
    ? router.query.month[0]
    : router.query.month;
  const monthKey = useMemo(
    () => resolveCalendarMonthKey(router.isReady ? requestedMonth : undefined),
    [requestedMonth, router.isReady],
  );
  const visibleDates = useMemo(
    () => getVisibleCalendarDates(monthKey),
    [monthKey],
  );
  const projectionIdentity = useMemo(
    () => monthProjectionIdentity(monthKey, visibleDates),
    [monthKey, visibleDates],
  );

  const applyProjectionData = useCallback((data: {
    planDays: PlanDay[];
    planSlots: PlanSlot[];
    meals: PlannedMeal[];
    coveringPlanByDate: Record<string, Plan>;
  }) => {
    setPlanDays(data.planDays);
    setPlanSlots(data.planSlots);
    setMeals(data.meals);
    setCoveringPlanByDate(data.coveringPlanByDate);
  }, []);

  const loadMonthProjection = useCallback(async (
    request: { token: number; identity: string },
    dates: string[],
  ) => {
    const data = await fetchMonthProjectionData(planService, dates);
    return applyMonthProjectionResult(projectionSessionRef.current, request, () => {
      applyProjectionData(data);
    });
  }, [applyProjectionData]);

  useEffect(() => {
    if (!router.isReady || requestedMonth === undefined || isCalendarMonthKey(requestedMonth)) {
      return;
    }
    void router.replace(APP_ROUTES.plansMonth, undefined, { shallow: true });
  }, [requestedMonth, router, router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;
    const request = beginMonthProjectionRequest(
      projectionSessionRef.current,
      projectionIdentity,
    );
    const dates = visibleDates;
    let cancelled = false;

    (async () => {
      setLoadState('loading');
      try {
        const [projectionApplied, templates, seed] = await Promise.all([
          loadMonthProjection(request, dates),
          planService.listPlanDayTemplates(),
          planService.getPlanDayDraftSeed(),
        ]);
        if (
          cancelled ||
          !isCurrentMonthProjectionRequest(projectionSessionRef.current, request)
        ) {
          return;
        }
        if (!projectionApplied) return;
        setDayPlans(templates);
        setProfileSeedSlots(seed.slots);
        setPersonId(seed.person_id);
        setLoadState('ready');
      } catch {
        if (
          !cancelled &&
          isCurrentMonthProjectionRequest(projectionSessionRef.current, request)
        ) {
          setLoadState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadMonthProjection, projectionIdentity, router.isReady, visibleDates]);

  const navigateToMonth = useCallback(
    (nextMonth: string) => {
      const isCurrent = nextMonth === currentCalendarMonthKey();
      void router.push(
        isCurrent
          ? APP_ROUTES.plansMonth
          : { pathname: APP_ROUTES.plansMonth, query: { month: nextMonth } },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const dayDraftSeed = useMemo(
    () =>
      personId
        ? blankDayTemplateFromSlots(personId, profileSeedSlots)
        : null,
    [personId, profileSeedSlots],
  );

  const blankTemplateForDate = useCallback(
    (dateLocal: string): PlanDayTemplate | null => {
      if (!personId) return null;
      return blankDayTemplateForDateContext({
        personId,
        dateLocal,
        profileSeedSlots,
        coveringPlan: coveringPlanByDate[dateLocal] ?? null,
      });
    },
    [coveringPlanByDate, personId, profileSeedSlots],
  );

  const dayPlanServices = {
    instantiatePlanDayTemplate: planService.instantiatePlanDayTemplate.bind(planService),
    savePlanDayTemplate: planService.savePlanDayTemplate.bind(planService),
    deleteMeal: planService.deleteMeal.bind(planService),
    updateMeal: planService.updateMeal.bind(planService),
    createMeal: planService.createMeal.bind(planService),
  };

  async function applyDayPlan(templateId: string, dateLocal: string) {
    const originIdentity = projectionIdentity;
    const originDates = visibleDates;
    setBusy(true);
    setModalError(null);
    try {
      const outcome = await applyReusableDayPlan({
        services: dayPlanServices,
        templateId,
        dateLocal,
        confirmAppend: (message) => window.confirm(message),
      });
      if (outcome === 'applied') {
        await refreshMonthProjectionIfCurrent(originIdentity, originDates);
      }
      return outcome;
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not apply this Day Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function refreshMonthProjectionIfCurrent(
    originIdentity: string,
    originDates: string[],
  ) {
    if (!shouldRefreshMonthAfterMutation(projectionSessionRef.current, originIdentity)) {
      return;
    }
    const request = beginMonthProjectionRequest(
      projectionSessionRef.current,
      originIdentity,
    );
    await loadMonthProjection(request, originDates);
  }

  async function createAndApplyDayPlanHandler(
    draft: PlanDayTemplate,
    dateLocal: string,
    existingSavedTemplateId?: string | null,
  ) {
    const originIdentity = projectionIdentity;
    const originDates = visibleDates;
    setBusy(true);
    setModalError(null);
    try {
      const result = await createAndApplyDayPlan({
        services: dayPlanServices,
        draft,
        dateLocal,
        confirmAppend: (message) => window.confirm(message),
        existingSavedTemplateId,
      });
      if (result.savedTemplate) {
        setDayPlans((current) => [
          result.savedTemplate!,
          ...current.filter((row) => row.id !== result.savedTemplate!.id),
        ]);
      }
      if (result.applyError) {
        setModalError(result.applyError);
      }
      if (result.outcome === 'applied') {
        await refreshMonthProjectionIfCurrent(originIdentity, originDates);
      }
      return result;
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not save and apply this Day Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function saveDatedDay(draft: PlanDayTemplate, dateLocal: string) {
    const originIdentity = projectionIdentity;
    const originDates = visibleDates;
    setBusy(true);
    setModalError(null);
    try {
      const outcome = await saveDatedDayPlan({
        services: dayPlanServices,
        draft,
        dateLocal,
        planDays,
        planSlots,
        meals,
      });
      if (outcome === 'applied') {
        await refreshMonthProjectionIfCurrent(originIdentity, originDates);
      }
      return outcome;
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not save this dated Day Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className="flex-1 overflow-x-hidden pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <div className="min-h-screen bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]">
          <div className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-12 sm:px-8 sm:pt-16">
            <MonthCalendarProjection
              loadState={loadState}
              monthKey={monthKey}
              visibleDates={visibleDates}
              planDays={planDays}
              planSlots={planSlots}
              meals={meals}
              dayPlans={dayPlans}
              dayDraftSeed={dayDraftSeed}
              blankTemplateForDate={blankTemplateForDate}
              busy={busy}
              modalError={modalError}
              isCurrentMonth={monthKey === currentCalendarMonthKey()}
              onPreviousMonth={() =>
                navigateToMonth(shiftCalendarMonthKey(monthKey, -1))
              }
              onCurrentMonth={() => navigateToMonth(currentCalendarMonthKey())}
              onNextMonth={() =>
                navigateToMonth(shiftCalendarMonthKey(monthKey, 1))
              }
              onApplyReusable={applyDayPlan}
              onCreateAndApply={createAndApplyDayPlanHandler}
              onSaveDated={saveDatedDay}
              onDayPlanCommitted={() => setModalError(null)}
            />
          </div>
        </div>
      </main>
      <JournalFooterNav />
    </div>
  );
}
