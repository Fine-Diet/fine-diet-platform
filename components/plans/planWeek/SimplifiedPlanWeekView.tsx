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
import { emitPlanWeekEvent } from '@/lib/plans/planWeek/emitEvent';
import {
  PLAN_WEEK_RETURN_PATH,
  buildPlanWeekDaysFromPlan,
  proposePlanWeek,
} from '@/lib/plans/planWeek/policy';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { planService } from '@/lib/plans/planService';
import { ensurePlanOccasionStructure } from '@/lib/plans/planStructure/save';
import type { Plan, PlanDay, PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '@/lib/plans/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

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
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [liveCache, setLiveCache] = useState<LiveCache | null>(null);
  const [actionError, setActionError] = useState('');
  const shownRef = useRef(false);
  const abandonedRef = useRef(false);
  const ensuringRef = useRef(false);

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
  }, [router.isReady, today]);

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
              <Link
                href={APP_ROUTES.plansRhythm}
                className="block w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
              >
                Set meal rhythm
              </Link>
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
                        if (occasion.status === 'planned') {
                          return (
                            <li key={`${occasion.date}:${occasion.slotKey}`}>
                              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                                <p className="text-sm text-white">{occasion.label}</p>
                                <p className="text-[11px] text-white/40">
                                  {plannedName ?? 'Planned'}
                                </p>
                              </div>
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

              {proposal.view !== 'complete' && proposal.nextOpen ? (
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

              {proposal.view === 'complete' ? (
                <Link
                  href={APP_ROUTES.plans}
                  className="block w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
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
