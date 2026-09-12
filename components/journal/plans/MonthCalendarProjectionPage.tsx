'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { MonthCalendarProjection } from '@/components/journal/plans/MonthCalendarProjection';
import {
  applyReusableDayPlan,
  createAndApplyDayPlan,
  saveDatedDayPlan,
} from '@/lib/plans/dayPlanActions';
import {
  currentCalendarMonthKey,
  getVisibleCalendarDates,
  isCalendarMonthKey,
  resolveCalendarMonthKey,
  shiftCalendarMonthKey,
} from '@/lib/plans/monthProjection';
import { selectPlansHomePlanningTarget } from '@/lib/plans/home/planningTarget';
import {
  planService,
  type PlanDay,
  type PlanDayTemplate,
  type PlanSlot,
  type PlannedMeal,
} from '@/lib/plans';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

type LoadState = 'loading' | 'ready' | 'error';

function blankDayTemplate(
  personId: string,
  slots: PlanDayTemplate['slots'],
): PlanDayTemplate {
  return {
    id: '',
    person_id: personId,
    name: 'Unnamed Day Plan',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'month-modal-draft',
    source_date_local: '',
    slots,
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
  };
}

export default function MonthCalendarProjectionPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [planSlots, setPlanSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [dayPlans, setDayPlans] = useState<PlanDayTemplate[]>([]);
  const [dayDraftSeed, setDayDraftSeed] = useState<PlanDayTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  const loadMonthProjection = useCallback(async () => {
    const plans = await planService.list();
    const targetPlanIds = Array.from(
      new Set(
        visibleDates.flatMap((dateLocal) => {
          const target = selectPlansHomePlanningTarget(plans, dateLocal);
          return target ? [target.plan.id] : [];
        }),
      ),
    );
    const details = await Promise.all(
      targetPlanIds.map((planId) => planService.getDetail(planId)),
    );
    const detailByPlanId = new Map(
      details.map((detail) => [detail.plan.id, detail]),
    );
    const selectedDays = visibleDates.flatMap((dateLocal) => {
      const target = selectPlansHomePlanningTarget(plans, dateLocal);
      const detail = target ? detailByPlanId.get(target.plan.id) : null;
      const day = detail?.days.find((row) => row.date_local === dateLocal);
      return day ? [day] : [];
    });
    const selectedDayIds = new Set(selectedDays.map((day) => day.id));

    setPlanDays(selectedDays);
    setPlanSlots(
      details.flatMap((detail) =>
        detail.slots.filter((slot) => selectedDayIds.has(slot.plan_day_id)),
      ),
    );
    setMeals(
      details.flatMap((detail) =>
        detail.meals.filter((meal) => selectedDayIds.has(meal.plan_day_id)),
      ),
    );
  }, [visibleDates]);

  useEffect(() => {
    if (!router.isReady || requestedMonth === undefined || isCalendarMonthKey(requestedMonth)) {
      return;
    }
    void router.replace(APP_ROUTES.plansMonth, undefined, { shallow: true });
  }, [requestedMonth, router, router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;

    (async () => {
      setLoadState('loading');
      try {
        const [, templates, seed] = await Promise.all([
          loadMonthProjection(),
          planService.listPlanDayTemplates(),
          planService.getPlanDayDraftSeed(),
        ]);
        if (cancelled) return;
        setDayPlans(templates);
        setDayDraftSeed(blankDayTemplate(seed.person_id, seed.slots));
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadMonthProjection, router.isReady]);

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

  const dayPlanServices = {
    instantiatePlanDayTemplate: planService.instantiatePlanDayTemplate.bind(planService),
    savePlanDayTemplate: planService.savePlanDayTemplate.bind(planService),
    deleteMeal: planService.deleteMeal.bind(planService),
    updateMeal: planService.updateMeal.bind(planService),
    createMeal: planService.createMeal.bind(planService),
  };

  async function applyDayPlan(templateId: string, dateLocal: string) {
    setBusy(true);
    setModalError(null);
    try {
      const outcome = await applyReusableDayPlan({
        services: dayPlanServices,
        templateId,
        dateLocal,
        confirmAppend: (message) => window.confirm(message),
      });
      if (outcome === 'applied') await loadMonthProjection();
      return outcome;
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not apply this Day Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function createAndApplyDayPlanHandler(
    draft: PlanDayTemplate,
    dateLocal: string,
    existingSavedTemplateId?: string | null,
  ) {
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
      if (result.outcome === 'applied') await loadMonthProjection();
      return result;
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not save and apply this Day Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function saveDatedDay(draft: PlanDayTemplate, dateLocal: string) {
    setBusy(true);
    setModalError(null);
    try {
      const outcome = await saveDatedDayPlan({
        services: dayPlanServices,
        draft,
        dateLocal,
        planDays,
        meals,
      });
      if (outcome === 'applied') await loadMonthProjection();
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
