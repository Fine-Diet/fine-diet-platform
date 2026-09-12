'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  getSevenCalendarDates,
  WeekPlanningWorkspace,
} from '@/components/journal/plans/WeekPlanningWorkspace';
import {
  getCalendarWeekRange,
  isCurrentCalendarWeek,
  isRealCalendarDateKey,
  shiftDateRangeByDays,
  type DateRange,
} from '@/lib/plans/planDateRange';
import { selectPlansHomePlanningTarget } from '@/lib/plans/home/planningTarget';
import {
  applyReusableDayPlan,
  createAndApplyDayPlan,
  saveDatedDayPlan,
} from '@/lib/plans/dayPlanActions';
import { defaultWeekPlanName } from '@/lib/plans/weekWorkspace';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlanDayTemplate,
  type PlanSlot,
  type PlannedMeal,
  type PlanWeekPattern,
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
    source_plan_day_id: 'week-modal-draft',
    source_date_local: '',
    slots,
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
  };
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function resolveSelectedCalendarWeek(start: unknown): DateRange {
  return isRealCalendarDateKey(start)
    ? getCalendarWeekRange(dateFromKey(start))
    : getCalendarWeekRange();
}

export default function WeekPlanningWorkspacePage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [planSlots, setPlanSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [dayPlans, setDayPlans] = useState<PlanDayTemplate[]>([]);
  const [dayDraftSeed, setDayDraftSeed] = useState<PlanDayTemplate | null>(null);
  const [weekPlans, setWeekPlans] = useState<PlanWeekPattern[]>([]);
  const [selectedWeekPlan, setSelectedWeekPlan] = useState<PlanWeekPattern | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedRange = useMemo(() => {
    if (!router.isReady) return getCalendarWeekRange();
    const start = Array.isArray(router.query.start) ? router.query.start[0] : router.query.start;
    return resolveSelectedCalendarWeek(start);
  }, [router.isReady, router.query.start]);

  const loadDatedPlan = useCallback(async () => {
    const plans = await planService.list();
    const dates = getSevenCalendarDates(selectedRange);
    const targetPlanIds = Array.from(
      new Set(
        dates.flatMap((dateLocal) => {
          const target = selectPlansHomePlanningTarget(plans, dateLocal);
          return target ? [target.plan.id] : [];
        }),
      ),
    );
    if (targetPlanIds.length === 0) {
      setPlan(null);
      setPlanDays([]);
      setPlanSlots([]);
      setMeals([]);
      return;
    }
    const details = await Promise.all(
      targetPlanIds.map((planId) => planService.getDetail(planId)),
    );
    const detailByPlanId = new Map(details.map((detail) => [detail.plan.id, detail]));
    const selectedDays = dates.flatMap((dateLocal) => {
      const target = selectPlansHomePlanningTarget(plans, dateLocal);
      const detail = target ? detailByPlanId.get(target.plan.id) : null;
      const day = detail?.days.find((row) => row.date_local === dateLocal);
      return day ? [day] : [];
    });
    const selectedDayIds = new Set(selectedDays.map((day) => day.id));
    const selectedPlanIds = new Set(selectedDays.map((day) => day.plan_id));
    setPlan(
      selectedPlanIds.size === 1
        ? details.find((detail) => selectedPlanIds.has(detail.plan.id))?.plan ?? null
        : null,
    );
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
  }, [selectedRange]);

  useEffect(() => {
    if (!router.isReady) return;
    (async () => {
      setLoadState('loading');
      try {
        const [, templates, patterns, seed] = await Promise.all([
          loadDatedPlan(),
          planService.listPlanDayTemplates(),
          planService.listPlanWeekPatterns(),
          planService.getPlanDayDraftSeed(),
        ]);
        setDayPlans(templates);
        setWeekPlans(patterns);
        setDayDraftSeed(blankDayTemplate(seed.person_id, seed.slots));
        setLoadState('ready');
      } catch {
        setLoadState('error');
      }
    })();
  }, [loadDatedPlan, router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;
    const start = Array.isArray(router.query.start) ? router.query.start[0] : router.query.start;
    const end = Array.isArray(router.query.end) ? router.query.end[0] : router.query.end;
    if (start !== selectedRange.start || end !== selectedRange.end) {
      void router.replace(
        {
          pathname: APP_ROUTES.plansWeek,
          query: { start: selectedRange.start, end: selectedRange.end },
        },
        undefined,
        { shallow: true },
      );
    }
  }, [router, router.isReady, router.query.end, router.query.start, selectedRange]);

  const navigateToRange = useCallback(
    (range: DateRange) => {
      void router.push(
        {
          pathname: APP_ROUTES.plansWeek,
          query: { start: range.start, end: range.end },
        },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const selectedPlanDays = useMemo(
    () =>
      planDays
        .filter(
          (day) =>
            day.date_local >= selectedRange.start &&
            day.date_local <= selectedRange.end,
        )
        .sort((a, b) => a.date_local.localeCompare(b.date_local)),
    [planDays, selectedRange],
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
    setError(null);
    setMessage(null);
    try {
      const outcome = await applyReusableDayPlan({
        services: dayPlanServices,
        templateId,
        dateLocal,
        confirmAppend: (message) => window.confirm(message),
      });
      if (outcome === 'applied') {
        await loadDatedPlan();
        setMessage(`Day Plan applied to ${dateLocal}.`);
      }
      return outcome;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply this Day Plan.');
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
    setError(null);
    setMessage(null);
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
      if (result.outcome === 'applied') {
        await loadDatedPlan();
        setMessage(`Day Plan saved and applied to ${dateLocal}.`);
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save and apply this Day Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function saveDatedDay(draft: PlanDayTemplate, dateLocal: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const outcome = await saveDatedDayPlan({
        services: dayPlanServices,
        draft,
        dateLocal,
        planDays,
        meals,
      });
      if (outcome === 'applied') {
        await loadDatedPlan();
        setMessage(`Saved changes to ${dateLocal}. The reusable Day Plan source was not changed.`);
      }
      return outcome;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this dated Day Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentWeek(name: string) {
    if (!plan || selectedPlanDays.length !== 7) {
      const nextError =
        'This week needs seven dated plan days before it can be saved as a reusable Week Plan.';
      setError(nextError);
      throw new Error(nextError);
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await planService.savePlanWeekPattern({
        plan_id: plan.id,
        source_plan_day_ids: selectedPlanDays.map((day) => day.id),
        name: name.trim() || defaultWeekPlanName(selectedRange.start),
      });
      setWeekPlans((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setSelectedWeekPlan(saved);
      setMessage('Week Plan saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this Week Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function createNewWeekPlan(name: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await planService.savePlanWeekPattern({
        mode: 'blank',
        day_count: 7,
        name: name.trim() || defaultWeekPlanName(selectedRange.start),
      });
      setWeekPlans((current) => [created, ...current]);
      setSelectedWeekPlan(created);
      setMessage('New reusable Week Plan created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a Week Plan.');
    } finally {
      setBusy(false);
    }
  }

  async function renameWeekPlan(name: string) {
    if (!selectedWeekPlan) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await planService.updatePlanWeekPattern(selectedWeekPlan.id, {
        name: name.trim() || defaultWeekPlanName(selectedRange.start),
      });
      setSelectedWeekPlan(updated);
      setWeekPlans((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setMessage('Week Plan saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this Week Plan.');
    } finally {
      setBusy(false);
    }
  }

  async function copyWeekPlan() {
    if (!selectedWeekPlan) return;
    setBusy(true);
    setError(null);
    try {
      const copy = await planService.duplicatePlanWeekPattern(selectedWeekPlan.id);
      setWeekPlans((current) => [copy, ...current]);
      setSelectedWeekPlan(copy);
      setMessage('Reusable Week Plan copied. No dated week was changed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy this Week Plan.');
    } finally {
      setBusy(false);
    }
  }

  async function applyWeekPlan(dateLocal: string) {
    if (!selectedWeekPlan) return;
    const targetRange = resolveSelectedCalendarWeek(dateLocal);
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      try {
        await planService.instantiatePlanWeekPattern(selectedWeekPlan.id, {
          target_start_date_local: targetRange.start,
          apply_policy: 'append',
        });
      } catch (err) {
        const text = err instanceof Error ? err.message : 'Could not apply this Week Plan.';
        if (!/already has|confirm append/i.test(text)) throw err;
        if (!window.confirm(`${text} Append this Week Plan anyway?`)) return;
        await planService.instantiatePlanWeekPattern(selectedWeekPlan.id, {
          target_start_date_local: targetRange.start,
          apply_policy: 'append',
          allow_duplicate_append: true,
        });
      }
      await loadDatedPlan();
      navigateToRange(targetRange);
      setMessage(`Week Plan applied to ${targetRange.start}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply this Week Plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className="flex-1 overflow-x-hidden pb-32">
        <div className="min-h-screen bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]">
          <div className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
            <WeekPlanningWorkspace
              loadState={loadState}
              selectedRange={selectedRange}
              isCurrentWeek={isCurrentCalendarWeek(selectedRange.start, selectedRange.end)}
              planDays={selectedPlanDays}
              planSlots={planSlots}
              meals={meals}
              dayPlans={dayPlans}
              dayDraftSeed={dayDraftSeed}
              personId={dayDraftSeed?.person_id ?? null}
              weekPlans={weekPlans}
              selectedWeekPlan={selectedWeekPlan}
              busy={busy}
              error={error}
              message={message}
              onPreviousWeek={() => navigateToRange(shiftDateRangeByDays(selectedRange, -7))}
              onThisWeek={() => navigateToRange(getCalendarWeekRange())}
              onNextWeek={() => navigateToRange(shiftDateRangeByDays(selectedRange, 7))}
              onAddDayPlan={applyDayPlan}
              onCreateAndApplyDayPlan={createAndApplyDayPlanHandler}
              onSaveDatedDay={saveDatedDay}
              onSaveCurrentWeek={saveCurrentWeek}
              onOpenWeekPlan={setSelectedWeekPlan}
              onNewWeekPlan={createNewWeekPlan}
              onRenameWeekPlan={renameWeekPlan}
              onCopyWeekPlan={copyWeekPlan}
              onApplyWeekPlan={applyWeekPlan}
            />
          </div>
        </div>
      </main>
      <JournalFooterNav />
    </div>
  );
}
