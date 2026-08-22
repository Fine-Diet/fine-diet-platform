'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { getEnabledMealSlots, isMealSlotKey } from '@/lib/journal/mealScheduleAssignment';
import { countForwardCoveredDaysFromPlan } from '@/lib/plans/decisioning/coverage';
import { PLANS_FORWARD_COVERAGE_POLICY } from '@/lib/plans/decisioning/forwardCoveragePolicy';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import { selectCurrentPlan } from '@/lib/plans/currentPlan';
import { buildPlansHomeCreateMealHref } from '@/lib/plans/home/plansHomeActionRoutes';
import { readSourceMealDocumentId } from '@/lib/plans/mealDocumentPlanPointer';
import { emitPlanRepeatEvent } from '@/lib/plans/planRepeat/emitEvent';
import {
  PLAN_REPEAT_POLICY_ID,
  PLAN_REPEAT_POLICY_VERSION,
  canSelectRepeatDestination,
  destinationKey,
} from '@/lib/plans/planRepeat/policy';
import { repeatSelectedOpenOccasions } from '@/lib/plans/planRepeat/save';
import { emitPlanWeekEvent } from '@/lib/plans/planWeek/emitEvent';
import {
  PLAN_WEEK_RETURN_PATH,
  buildPlanWeekDaysFromPlan,
  proposePlanWeek,
} from '@/lib/plans/planWeek/policy';
import { emitPlanGroceryHandoffEvent } from '@/lib/plans/planGroceryHandoff/emitEvent';
import {
  PLAN_GROCERY_HANDOFF_POLICY_ID,
  PLAN_GROCERY_HANDOFF_POLICY_VERSION,
  evaluatePlanGroceryHandoff,
  formatNoPlannedDemandCopy,
  formatPlanGroceryClampCopy,
  proposePlanGroceryRange,
} from '@/lib/plans/planGroceryHandoff/policy';
import { commitPlanGroceryHandoff } from '@/lib/plans/planGroceryHandoff/save';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { planService } from '@/lib/plans/planService';
import { ensurePlanOccasionStructure } from '@/lib/plans/planStructure/save';
import type { MealSlotKey, Plan, PlanDay, PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '@/lib/plans/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { useMealRhythmOverlay } from '@/components/plans/rhythm/MealRhythmOverlayProvider';

type LiveCache = {
  plan: Plan | null;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
  scheduleSlots: ResolvedScheduleSlot[];
  hasSchedule: boolean;
  errorMessage?: string;
};

export function SimplifiedPlanWeekView() {
  const router = useRouter();
  const today = todayLocalDateKey();
  const mealRhythmOverlay = useMealRhythmOverlay();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [liveCache, setLiveCache] = useState<LiveCache | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [actionError, setActionError] = useState('');
  const [repeatSource, setRepeatSource] = useState<{
    mealId: string;
    date: string;
    slotKey: MealSlotKey;
    documentId: string | null;
  } | null>(null);
  const [selectedDestKeys, setSelectedDestKeys] = useState<string[]>([]);
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [repeatSummary, setRepeatSummary] = useState('');
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [groceryStart, setGroceryStart] = useState('');
  const [groceryEnd, setGroceryEnd] = useState('');
  const [groceryBusy, setGroceryBusy] = useState(false);
  const [groceryNotice, setGroceryNotice] = useState('');
  const shownRef = useRef(false);
  const abandonedRef = useRef(false);
  const ensuringRef = useRef(false);
  const repeatingRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    (async () => {
      setLoadState('loading');
      try {
        const [plans, profileRes] = await Promise.all([
          planService.list(),
          fetch('/api/journal/profile', { credentials: 'include' }).then(async (res) => {
            if (!res.ok) return null;
            return (await res.json()) as { profile?: { meal_schedule?: unknown } };
          }),
        ]);
        const scheduleRaw = profileRes?.profile?.meal_schedule ?? null;
        const hasSchedule = isUsableSavedMealSchedule(scheduleRaw);
        const scheduleSlots = hasSchedule ? getEnabledMealSlots(scheduleRaw) : [];
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
          setLoadState('ready');
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
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setLiveCache({
          plan: null,
          days: [],
          slots: [],
          meals: [],
          scheduleSlots: [],
          hasSchedule: false,
          errorMessage: 'Could not load this week.',
        });
        setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, today, refreshToken]);

  const dayInputs = useMemo(() => {
    if (!liveCache) return [];
    return buildPlanWeekDaysFromPlan({
      today,
      scheduleSlots: liveCache.scheduleSlots,
      plan: liveCache.plan,
      days: liveCache.days,
      slots: liveCache.slots,
      meals: liveCache.meals,
    });
  }, [liveCache, today]);

  const proposal = proposePlanWeek({
    today,
    hasUsableRhythm: liveCache?.hasSchedule ?? false,
    days: dayInputs,
    planId: liveCache?.plan?.id ?? null,
    forwardCoveredDayCount: countForwardCoveredDaysFromPlan({
      today,
      days: liveCache?.days ?? [],
      meals: liveCache?.meals ?? [],
      horizonDays: PLANS_FORWARD_COVERAGE_POLICY.horizonDays,
    }),
    loadError: loadState === 'error',
  });

  const mealNameByKey = useMemo(() => {
    const names = new Map<string, string>();
    for (const day of dayInputs) {
      for (const row of day.rows) {
        if (row.mealName) names.set(`${day.date}:${row.slotKey}`, row.mealName);
      }
    }
    return names;
  }, [dayInputs]);

  const mealIdByKey = useMemo(() => {
    const ids = new Map<string, string>();
    for (const day of dayInputs) {
      for (const row of day.rows) {
        if (row.mealId) ids.set(`${day.date}:${row.slotKey}`, row.mealId);
      }
    }
    return ids;
  }, [dayInputs]);

  const groceryProposal = useMemo(
    () =>
      proposePlanGroceryRange({
        today,
        plan: liveCache?.plan ?? null,
        days: liveCache?.days ?? [],
      }),
    [today, liveCache],
  );

  function plannedMealForOccasion(date: string, slotKey: string): PlannedMeal | null {
    const mealId = mealIdByKey.get(`${date}:${slotKey}`);
    if (!mealId || !liveCache) return null;
    return liveCache.meals.find((meal) => meal.id === mealId) ?? null;
  }

  useEffect(() => {
    if (loadState !== 'ready' || shownRef.current) return;
    shownRef.current = true;
    emitPlanWeekEvent({
      event: proposal.view === 'complete' ? 'plan_week_complete_shown' : 'plan_week_shown',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'exposed',
      reasonCodes: proposal.reasonCodes,
      openCount: proposal.openCount,
      plannedCount: proposal.plannedCount,
      attachableOpenCount: proposal.attachableOpenCount,
      date: proposal.nextOpen?.date ?? null,
      slotKey: proposal.nextOpen?.slotKey ?? null,
      canAttach: proposal.nextOpen?.canAttach ?? proposal.canAttachAny,
    });
  }, [loadState, proposal]);

  const markAbandoned = useCallback(() => {
    if (abandonedRef.current) return;
    abandonedRef.current = true;
    emitPlanWeekEvent({
      event: 'plan_week_abandoned',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'cancel',
      reasonCodes: [...proposal.reasonCodes, 'user_cancelled'],
      openCount: proposal.openCount,
      plannedCount: proposal.plannedCount,
      attachableOpenCount: proposal.attachableOpenCount,
      date: proposal.nextOpen?.date ?? null,
      slotKey: proposal.nextOpen?.slotKey ?? null,
      canAttach: proposal.nextOpen?.canAttach ?? proposal.canAttachAny,
    });
  }, [proposal]);

  function emptyRepeatEvent(args: {
    event: 'plan_repeat_started' | 'plan_repeat_destination_toggled' | 'plan_repeat_abandoned';
    path: 'primary' | 'cancel';
    reasonCodes: string[];
    mealId: string;
    documentId: string | null;
    dateLocal: string | null;
    slotKey: string | null;
    selected: boolean;
    destinationCount: number;
  }) {
    const planId = liveCache?.plan?.id ?? '';
    if (!planId) return;
    emitPlanRepeatEvent({
      event: args.event,
      policyId: PLAN_REPEAT_POLICY_ID,
      policyVersion: PLAN_REPEAT_POLICY_VERSION,
      path: args.path,
      reasonCodes: args.reasonCodes,
      planId,
      sourcePlannedMealId: args.mealId,
      sourceMealDocumentId: args.documentId,
      dateLocal: args.dateLocal,
      slotKey: args.slotKey,
      selected: args.selected,
      destinationCount: args.destinationCount,
      attachedCount: 0,
      reusedCount: 0,
      occupiedSkippedCount: 0,
      invalidCount: 0,
      failedCount: 0,
      partial: false,
    });
  }

  function startRepeat(date: string, slotKey: MealSlotKey) {
    const meal = plannedMealForOccasion(date, slotKey);
    const documentId = meal ? readSourceMealDocumentId(meal.payload) : null;
    if (!meal || !documentId) return;
    setRepeatSource({
      mealId: meal.id,
      date,
      slotKey,
      documentId,
    });
    setSelectedDestKeys([]);
    setRepeatSummary('');
    setActionError('');
    emptyRepeatEvent({
      event: 'plan_repeat_started',
      path: 'primary',
      reasonCodes: ['explicit_repeat_selected_open'],
      mealId: meal.id,
      documentId,
      dateLocal: date,
      slotKey,
      selected: false,
      destinationCount: 0,
    });
  }

  function cancelRepeat() {
    if (repeatSource) {
      emptyRepeatEvent({
        event: 'plan_repeat_abandoned',
        path: 'cancel',
        reasonCodes: ['user_cancelled'],
        mealId: repeatSource.mealId,
        documentId: repeatSource.documentId,
        dateLocal: repeatSource.date,
        slotKey: repeatSource.slotKey,
        selected: false,
        destinationCount: selectedDestKeys.length,
      });
    }
    setRepeatSource(null);
    setSelectedDestKeys([]);
  }

  function toggleRepeatDestination(date: string, slotKey: MealSlotKey, selectable: boolean) {
    if (!repeatSource || !selectable || repeatBusy) return;
    const key = destinationKey(date, slotKey);
    const selected = !selectedDestKeys.includes(key);
    setSelectedDestKeys((current) =>
      selected ? [...current, key] : current.filter((item) => item !== key),
    );
    emptyRepeatEvent({
      event: 'plan_repeat_destination_toggled',
      path: 'primary',
      reasonCodes: ['explicit_destination_toggle'],
      mealId: repeatSource.mealId,
      documentId: repeatSource.documentId,
      dateLocal: date,
      slotKey,
      selected,
      destinationCount: selected ? selectedDestKeys.length + 1 : selectedDestKeys.length - 1,
    });
  }

  async function commitRepeat() {
    const planId = liveCache?.plan?.id ?? null;
    if (!repeatSource || !planId || selectedDestKeys.length === 0 || repeatingRef.current) return;
    repeatingRef.current = true;
    setRepeatBusy(true);
    setActionError('');
    const destinations = selectedDestKeys.flatMap((key) => {
      const [dateLocal, slotKey] = key.split(':');
      if (!dateLocal || !isMealSlotKey(slotKey)) return [];
      return [{ dateLocal, slotKey }];
    });
    const repeated = await repeatSelectedOpenOccasions({
      planId,
      sourcePlannedMealId: repeatSource.mealId,
      sourceMealDocumentId: repeatSource.documentId,
      destinations,
    });
    repeatingRef.current = false;
    setRepeatBusy(false);
    if (!repeated.ok) {
      setActionError(repeated.error);
      return;
    }
    setRepeatSummary(repeated.summary);
    setRepeatSource(null);
    setSelectedDestKeys([]);
    try {
      const detail = await planService.getDetail(planId);
      setLiveCache((prev) =>
        prev
          ? {
              ...prev,
              plan: detail.plan,
              days: detail.days,
              slots: detail.slots,
              meals: detail.meals,
            }
          : prev,
      );
    } catch {
      /* keep current week; summary still reports the write */
    }
  }

  async function fillSlot(
    date: string,
    slotKey: string,
    canAttach: boolean,
    canEnsure: boolean,
  ) {
    if (!isMealSlotKey(slotKey) || ensuringRef.current) return;
    emitPlanWeekEvent({
      event: 'plan_week_open_slot_started',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'primary',
      reasonCodes: [...proposal.reasonCodes, 'fill_next_open_slot'],
      openCount: proposal.openCount,
      plannedCount: proposal.plannedCount,
      attachableOpenCount: proposal.attachableOpenCount,
      date,
      slotKey,
      canAttach: canAttach || canEnsure,
    });
    const planId = canAttach || canEnsure ? liveCache?.plan?.id ?? null : null;
    if (planId && canEnsure && !canAttach) {
      ensuringRef.current = true;
      setActionError('');
      const ensured = await ensurePlanOccasionStructure({
        planId,
        dateLocal: date,
        slotKey,
      });
      ensuringRef.current = false;
      if (!ensured.ok) {
        setActionError(ensured.error);
        return;
      }
      void router.push(
        buildPlansHomeCreateMealHref({
          date,
          slot: slotKey,
          planId,
          returnTo: PLAN_WEEK_RETURN_PATH,
          planDayId: ensured.result.planDayId,
          planSlotId: ensured.result.planSlotId,
        }),
      );
      return;
    }
    void router.push(
      buildPlansHomeCreateMealHref({
        date,
        slot: slotKey,
        planId,
        returnTo: PLAN_WEEK_RETURN_PATH,
      }),
    );
  }

  function reviewOpenDays() {
    const firstOpen = proposal.days.find((day) => day.openCount > 0);
    if (!firstOpen) return;
    document.getElementById(`plan-week-day-${firstOpen.date}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  const coverage = proposal.forwardCoverage;
  const showGroceryHandoff =
    Boolean(liveCache?.plan?.id) &&
    (proposal.view === 'board' || proposal.view === 'complete') &&
    !repeatSource;

  function groceryEvent(args: {
    event:
      | 'plan_grocery_handoff_started'
      | 'plan_grocery_range_changed'
      | 'plan_grocery_no_planned_demand'
      | 'plan_grocery_handoff_abandoned';
    path: 'primary' | 'cancel';
    reasonCodes: string[];
    dateStart: string | null;
    dateEnd: string | null;
    plannedMealCount: number;
  }) {
    const planId = liveCache?.plan?.id ?? '';
    if (!planId) return;
    emitPlanGroceryHandoffEvent({
      event: args.event,
      policyId: PLAN_GROCERY_HANDOFF_POLICY_ID,
      policyVersion: PLAN_GROCERY_HANDOFF_POLICY_VERSION,
      path: args.path,
      reasonCodes: args.reasonCodes,
      planId,
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      plannedMealCount: args.plannedMealCount,
      outcome: 'none',
      clamped: groceryProposal?.clamped ?? false,
      listId: null,
      selectionKind: null,
    });
  }

  function openGroceryHandoff() {
    if (!groceryProposal || groceryBusy) return;
    setGroceryStart(groceryProposal.dateStart);
    setGroceryEnd(groceryProposal.dateEnd);
    setGroceryNotice(formatPlanGroceryClampCopy(groceryProposal) ?? '');
    setGroceryOpen(true);
    setActionError('');
    groceryEvent({
      event: 'plan_grocery_handoff_started',
      path: 'primary',
      reasonCodes: groceryProposal.reasonCodes,
      dateStart: groceryProposal.dateStart,
      dateEnd: groceryProposal.dateEnd,
      plannedMealCount: 0,
    });
  }

  function cancelGroceryHandoff() {
    groceryEvent({
      event: 'plan_grocery_handoff_abandoned',
      path: 'cancel',
      reasonCodes: ['user_cancelled'],
      dateStart: groceryStart || null,
      dateEnd: groceryEnd || null,
      plannedMealCount: 0,
    });
    setGroceryOpen(false);
    setGroceryNotice('');
  }

  function changeGroceryRange(nextStart: string, nextEnd: string) {
    setGroceryStart(nextStart);
    setGroceryEnd(nextEnd);
    groceryEvent({
      event: 'plan_grocery_range_changed',
      path: 'primary',
      reasonCodes: ['user_changed_range'],
      dateStart: nextStart || null,
      dateEnd: nextEnd || null,
      plannedMealCount: 0,
    });
  }

  async function commitGroceryHandoff() {
    const planId = liveCache?.plan?.id ?? null;
    if (!planId || groceryBusy) return;
    const decision = evaluatePlanGroceryHandoff({
      plan: liveCache?.plan ?? null,
      days: liveCache?.days ?? [],
      meals: liveCache?.meals ?? [],
      proposed: groceryProposal,
      dateStart: groceryStart,
      dateEnd: groceryEnd,
    });
    if (decision.action === 'reject') {
      setGroceryNotice(
        decision.reasonCodes.includes('outside_plan_coverage')
          ? 'Stay inside your current plan dates. Fine Diet will not extend the plan from here.'
          : 'Use real calendar dates, with the end on or after the start.',
      );
      return;
    }
    if (decision.action === 'no_planned_demand') {
      groceryEvent({
        event: 'plan_grocery_no_planned_demand',
        path: 'primary',
        reasonCodes: decision.reasonCodes,
        dateStart: decision.dateStart,
        dateEnd: decision.dateEnd,
        plannedMealCount: 0,
      });
      setGroceryNotice(formatNoPlannedDemandCopy());
      return;
    }
    setGroceryBusy(true);
    setActionError('');
    const committed = await commitPlanGroceryHandoff({
      planId,
      dateStart: decision.dateStart,
      dateEnd: decision.dateEnd,
      plannedMealCount: decision.plannedMealCount,
      clamped: groceryProposal?.clamped ?? false,
      reasonCodes: decision.reasonCodes,
    });
    setGroceryBusy(false);
    if (!committed.ok) {
      setActionError(committed.error);
      return;
    }
    void router.push(committed.result.href);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#000000] text-white">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero className="overflow-hidden bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
          <div className="relative z-10 mx-auto flex min-h-[220px] w-full max-w-[650px] flex-col justify-center px-6 pb-14 pt-12 sm:min-h-[240px]">
            <Link
              href={APP_ROUTES.plans}
              onClick={markAbandoned}
              className="text-xs text-white/60 hover:text-white/80"
            >
              ← Plans
            </Link>
            <h1 className="mt-4 max-w-[520px] text-4xl font-semibold tracking-[-0.03em] text-white antialiased sm:text-5xl">
              This week
            </h1>
            <p className="mt-3 max-w-md text-sm leading-snug text-white/78 antialiased">
              Keep what’s already planned. Fill the next open occasion.
            </p>
          </div>
        </StackedPageHero>

        <StackedPageSection layer={1} className="bg-[#16110d] pb-24">
          {loadState === 'loading' ? (
            <p className="text-sm text-white/55">Looking at this week’s meals…</p>
          ) : proposal.view === 'error' ? (
            <p className="text-sm text-red-300">
              {liveCache?.errorMessage ?? 'Could not load this week.'}
            </p>
          ) : proposal.view === 'missing_rhythm' ? (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                Set your meal rhythm first so this week knows which occasions to fill.
              </p>
              <button
                type="button"
                onClick={() =>
                  mealRhythmOverlay.openMealRhythm({
                    trigger: 'plans_week',
                    onSaved: () => setRefreshToken((n) => n + 1),
                  })
                }
                className="block w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
              >
                Set meal rhythm
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-white/55">
                {coverage.coveredDayCount} of the next {coverage.horizonDays} days have a planned
                meal.
              </p>
              {!proposal.canAttachAny && !proposal.canEnsureAny ? (
                <p className="text-sm text-white/55">
                  You can still save a meal to your library. It is not added to the plan until that
                  day is on an active plan.
                </p>
              ) : null}
              {actionError ? <p className="text-sm text-red-300">{actionError}</p> : null}
              {repeatSummary ? <p className="text-sm text-white/70">{repeatSummary}</p> : null}
              {groceryOpen ? (
                <div className="space-y-3 rounded-2xl bg-white/[0.04] px-4 py-3">
                  <p className="text-sm text-white">Build a grocery list from planned meals.</p>
                  <p className="text-[11px] text-white/40">
                    Confirm the date range first. Fine Diet reuses an existing list for this plan
                    and range when one already exists.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[11px] text-white/45">
                      Start
                      <input
                        type="date"
                        value={groceryStart}
                        min={groceryProposal?.planStart}
                        max={groceryProposal?.planEnd}
                        onChange={(event) => changeGroceryRange(event.target.value, groceryEnd)}
                        className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="block text-[11px] text-white/45">
                      End
                      <input
                        type="date"
                        value={groceryEnd}
                        min={groceryProposal?.planStart}
                        max={groceryProposal?.planEnd}
                        onChange={(event) => changeGroceryRange(groceryStart, event.target.value)}
                        className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white"
                      />
                    </label>
                  </div>
                  {groceryNotice ? <p className="text-sm text-white/70">{groceryNotice}</p> : null}
                  <button
                    type="button"
                    onClick={() => void commitGroceryHandoff()}
                    disabled={groceryBusy || !groceryStart || !groceryEnd}
                    className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {groceryBusy ? 'Building list…' : 'Make grocery list'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelGroceryHandoff}
                    disabled={groceryBusy}
                    className="w-full py-2 text-center text-sm text-white/45 hover:text-white/70"
                  >
                    Not this range
                  </button>
                </div>
              ) : null}
              {repeatSource ? (
                <div className="space-y-3 rounded-2xl bg-white/[0.04] px-4 py-3">
                  <p className="text-sm text-white">
                    Repeating {mealNameByKey.get(`${repeatSource.date}:${repeatSource.slotKey}`) ?? 'this meal'} onto selected open occasions.
                  </p>
                  <p className="text-[11px] text-white/40">
                    {selectedDestKeys.length} selected. Occupied occasions stay as they are.
                  </p>
                  <button
                    type="button"
                    onClick={() => void commitRepeat()}
                    disabled={repeatBusy || selectedDestKeys.length === 0}
                    className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {repeatBusy ? 'Repeating…' : 'Repeat to selected occasions'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelRepeat}
                    disabled={repeatBusy}
                    className="w-full py-2 text-center text-sm text-white/45 hover:text-white/70"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              <ul className="space-y-3">
                {proposal.days.map((day) => (
                  <li
                    key={day.date}
                    id={`plan-week-day-${day.date}`}
                    className="rounded-2xl bg-white/[0.04] px-4 py-3"
                  >
                    <p className="text-sm font-medium text-white">
                      {day.weekdayShort} {day.date.slice(8, 10)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      {day.plannedCount} planned · {day.openCount} open
                      {day.inPlanRange ? '' : ' · not on this plan'}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {day.occasions.map((occasion) => {
                        const plannedName = mealNameByKey.get(
                          `${occasion.date}:${occasion.slotKey}`,
                        );
                        const selectable = canSelectRepeatDestination(occasion);
                        const destKey = destinationKey(occasion.date, occasion.slotKey);
                        const isSource =
                          repeatSource?.date === occasion.date &&
                          repeatSource?.slotKey === occasion.slotKey;
                        const isSelected = selectedDestKeys.includes(destKey);
                        if (occasion.status === 'planned') {
                          const meal = plannedMealForOccasion(occasion.date, occasion.slotKey);
                          const repeatSlotKey = isMealSlotKey(occasion.slotKey)
                            ? occasion.slotKey
                            : null;
                          const canRepeat =
                            !repeatSource &&
                            Boolean(repeatSlotKey && meal && readSourceMealDocumentId(meal.payload));
                          return (
                            <li key={`${occasion.date}:${occasion.slotKey}`}>
                              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                                <p className="text-sm text-white">{occasion.label}</p>
                                <p className="text-[11px] text-white/40">
                                  {isSource ? 'Repeating this meal' : plannedName ?? 'Planned'}
                                </p>
                                {canRepeat && repeatSlotKey ? (
                                  <button
                                    type="button"
                                    onClick={() => startRepeat(occasion.date, repeatSlotKey)}
                                    className="mt-1 text-[11px] text-white/55 hover:text-white/80"
                                  >
                                    Repeat
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          );
                        }
                        if (repeatSource) {
                          return (
                            <li key={`${occasion.date}:${occasion.slotKey}`}>
                              <button
                                type="button"
                                disabled={!selectable || repeatBusy}
                                onClick={() => {
                                  if (!isMealSlotKey(occasion.slotKey)) return;
                                  toggleRepeatDestination(
                                    occasion.date,
                                    occasion.slotKey,
                                    selectable,
                                  );
                                }}
                                className="flex w-full items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-left disabled:opacity-40"
                              >
                                <span>
                                  <span className="block text-sm text-white">{occasion.label}</span>
                                  <span className="text-[11px] text-white/40">
                                    {selectable ? 'Open' : 'Not available'}
                                  </span>
                                </span>
                                <span className="text-[11px] text-white/40">
                                  {selectable ? (isSelected ? 'Selected' : 'Select') : ''}
                                </span>
                              </button>
                            </li>
                          );
                        }
                        return (
                          <li key={`${occasion.date}:${occasion.slotKey}`}>
                            <button
                              type="button"
                              onClick={() =>
                                void fillSlot(
                                  occasion.date,
                                  occasion.slotKey,
                                  occasion.canAttach,
                                  occasion.canEnsure,
                                )
                              }
                              className="flex w-full items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-left"
                            >
                              <span>
                                <span className="block text-sm text-white">{occasion.label}</span>
                                <span className="text-[11px] text-white/40">Open</span>
                              </span>
                              <span className="text-[11px] text-white/40">
                                {occasion.canAttach || occasion.canEnsure ? 'Plan' : 'Save'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>

              {proposal.view === 'complete' ? (
                <p className="text-sm text-white/70">
                  Attachable occasions this week are planned.
                </p>
              ) : null}

              {showGroceryHandoff && !groceryOpen ? (
                <button
                  type="button"
                  onClick={openGroceryHandoff}
                  className={
                    proposal.view === 'complete'
                      ? 'w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black'
                      : 'w-full rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white'
                  }
                >
                  Build grocery list
                </button>
              ) : null}

              {proposal.view !== 'complete' && proposal.nextOpen && !repeatSource && !groceryOpen ? (
                <button
                  type="button"
                  onClick={() =>
                    void fillSlot(
                      proposal.nextOpen!.date,
                      proposal.nextOpen!.slotKey,
                      proposal.nextOpen!.canAttach,
                      proposal.nextOpen!.canEnsure,
                    )
                  }
                  className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
                >
                  {proposal.nextOpen.canAttach || proposal.nextOpen.canEnsure
                    ? `Plan ${proposal.nextOpen.label}`
                    : `Save ${proposal.nextOpen.label} to library`}
                </button>
              ) : null}

              {proposal.view === 'complete' && !groceryOpen ? (
                <Link
                  href={APP_ROUTES.plans}
                  className="block w-full rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white"
                >
                  Back to Plans
                </Link>
              ) : null}

              {proposal.openCount > 0 ? (
                <button
                  type="button"
                  onClick={reviewOpenDays}
                  className="w-full rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white"
                >
                  Review open days
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  markAbandoned();
                  void router.push(APP_ROUTES.plans);
                }}
                className="w-full py-2 text-center text-sm text-white/45 hover:text-white/70"
              >
                Not now
              </button>
            </div>
          )}
        </StackedPageSection>
      </div>
      <JournalFooterNav />
    </div>
  );
}
