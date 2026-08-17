'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { getEnabledMealSlots, isMealSlotKey } from '@/lib/journal/mealScheduleAssignment';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import { selectCurrentPlan } from '@/lib/plans/currentPlan';
import {
  buildPlansHomeGuidance,
  resolveDefaultPlansHomeSelectedDate,
} from '@/lib/plans/home/buildGuidance';
import { buildPlansHomeCreateMealHref } from '@/lib/plans/home/plansHomeActionRoutes';
import type { PlansMealGuidanceRow } from '@/lib/plans/home/types';
import { emitPlanTodayEvent } from '@/lib/plans/planToday/emitEvent';
import { proposePlanToday } from '@/lib/plans/planToday/policy';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import { planService } from '@/lib/plans/planService';
import { occasionNeedsStructureEnsure } from '@/lib/plans/planStructure/policy';
import { ensurePlanOccasionStructure } from '@/lib/plans/planStructure/save';
import { resolvePlanSlotForCreateKey } from '@/lib/plans/resolvePlanSlotForCreateKey';
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

function openRowsFromSchedule(slots: ResolvedScheduleSlot[]): PlansMealGuidanceRow[] {
  return slots.map((slot) => ({
    slotKey: slot.key,
    targetTimeLabel: slot.target_time,
    targetTimeValue: slot.target_time,
    label: slot.label,
    mealName: null,
    mealId: null,
    state: 'empty' as const,
  }));
}

export function SimplifiedPlanTodayView() {
  const router = useRouter();
  const today = todayLocalDateKey();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [liveCache, setLiveCache] = useState<LiveCache | null>(null);
  const [dateInPlanRange, setDateInPlanRange] = useState(true);
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
          setDateInPlanRange(false);
          setLoadState('ready');
          return;
        }
        const detail = await planService.getDetail(current.id);
        if (cancelled) return;
        const resolved = resolveDefaultPlansHomeSelectedDate({
          today,
          plan: detail.plan,
          days: detail.days,
        });
        setLiveCache({
          plan: detail.plan,
          days: detail.days,
          slots: detail.slots,
          meals: detail.meals,
          scheduleSlots,
          hasSchedule,
        });
        setDateInPlanRange(resolved.inRange);
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
          errorMessage: 'Could not load today.',
        });
        setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, today]);

  const guidance = useMemo(() => {
    if (!liveCache) {
      return buildPlansHomeGuidance({
        plan: null,
        days: [],
        slots: [],
        meals: [],
        scheduleSlots: [],
        selectedDate: today,
        hasSchedule: false,
      });
    }
    return buildPlansHomeGuidance({
      plan: liveCache.plan,
      days: liveCache.days,
      slots: liveCache.slots,
      meals: liveCache.meals,
      scheduleSlots: liveCache.scheduleSlots,
      selectedDate: today,
      hasSchedule: liveCache.hasSchedule,
      dateInPlanRange,
      errorMessage: liveCache.errorMessage,
    });
  }, [dateInPlanRange, liveCache, today]);

  const displayRows =
    guidance.status === 'ready'
      ? guidance.rows
      : openRowsFromSchedule(liveCache?.scheduleSlots ?? []);

  const proposal = proposePlanToday({
    date: today,
    hasUsableRhythm: liveCache?.hasSchedule ?? false,
    guidanceStatus: guidance.status,
    rows: displayRows,
    planId: guidance.planId,
  });

  const mealNameBySlot = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of displayRows) {
      if (row.mealName) names.set(row.slotKey, row.mealName);
    }
    return names;
  }, [displayRows]);

  useEffect(() => {
    if (loadState !== 'ready' || shownRef.current) return;
    shownRef.current = true;
    emitPlanTodayEvent({
      event: proposal.view === 'complete' ? 'plan_today_complete_shown' : 'plan_today_shown',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'exposed',
      reasonCodes: proposal.reasonCodes,
      openCount: proposal.openCount,
      plannedCount: proposal.plannedCount,
      slotKey: proposal.nextOpenSlotKey,
      canAttach: proposal.canAttach,
    });
  }, [loadState, proposal]);

  const markAbandoned = useCallback(() => {
    if (abandonedRef.current) return;
    abandonedRef.current = true;
    emitPlanTodayEvent({
      event: 'plan_today_abandoned',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'cancel',
      reasonCodes: [...proposal.reasonCodes, 'user_cancelled'],
      openCount: proposal.openCount,
      plannedCount: proposal.plannedCount,
      slotKey: proposal.nextOpenSlotKey,
      canAttach: proposal.canAttach,
    });
  }, [proposal]);

  async function fillSlot(slotKey: string) {
    if (!isMealSlotKey(slotKey) || ensuringRef.current) return;
    emitPlanTodayEvent({
      event: 'plan_today_next_started',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'primary',
      reasonCodes: [...proposal.reasonCodes, 'fill_next_open_slot'],
      openCount: proposal.openCount,
      plannedCount: proposal.plannedCount,
      slotKey,
      canAttach: proposal.canAttach,
    });
    const planId = proposal.canAttach ? guidance.planId : null;
    if (planId) {
      const day = liveCache?.days.find((row) => row.date_local === today) ?? null;
      const daySlots = day
        ? (liveCache?.slots.filter((row) => row.plan_day_id === day.id) ?? [])
        : [];
      const matchingSlot = resolvePlanSlotForCreateKey(slotKey, daySlots);
      if (
        occasionNeedsStructureEnsure({
          canFillOnPlan: true,
          hasPlanDay: Boolean(day),
          hasMatchingSlot: Boolean(matchingSlot),
        })
      ) {
        ensuringRef.current = true;
        setActionError('');
        const ensured = await ensurePlanOccasionStructure({
          planId,
          dateLocal: today,
          slotKey,
        });
        ensuringRef.current = false;
        if (!ensured.ok) {
          setActionError(ensured.error);
          return;
        }
        void router.push(
          buildPlansHomeCreateMealHref({
            date: today,
            slot: slotKey,
            planId,
            returnTo: APP_ROUTES.todayPlan,
            planDayId: ensured.result.planDayId,
            planSlotId: ensured.result.planSlotId,
          }),
        );
        return;
      }
    }
    void router.push(
      buildPlansHomeCreateMealHref({
        date: today,
        slot: slotKey,
        planId,
        returnTo: APP_ROUTES.todayPlan,
      }),
    );
  }

  const nextOccasion = proposal.occasions.find(
    (item) => item.slotKey === proposal.nextOpenSlotKey,
  );

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
              Today
            </h1>
            <p className="mt-3 max-w-md text-sm leading-snug text-white/78 antialiased">
              Fill the next open occasion. Already planned meals stay as they are.
            </p>
          </div>
        </StackedPageHero>

        <StackedPageSection layer={1} className="bg-[#16110d] pb-24">
          {loadState === 'loading' ? (
            <p className="text-sm text-white/55">Looking at today’s meals…</p>
          ) : proposal.view === 'error' ? (
            <p className="text-sm text-red-300">
              {liveCache?.errorMessage ?? 'Could not load today.'}
            </p>
          ) : proposal.view === 'missing_rhythm' ? (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                Set your meal rhythm first so today knows which occasions to fill.
              </p>
              <Link
                href={APP_ROUTES.plansRhythm}
                className="block w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
              >
                Set meal rhythm
              </Link>
            </div>
          ) : proposal.view === 'complete' ? (
            <div className="space-y-4">
              <p className="text-sm text-white/70">Today’s enabled occasions are planned.</p>
              <ul className="space-y-2">
                {proposal.occasions.map((occasion) => (
                  <li
                    key={occasion.slotKey}
                    className="rounded-2xl bg-white/[0.04] px-4 py-3"
                  >
                    <p className="text-sm font-medium text-white">{occasion.label}</p>
                    <p className="text-[11px] text-white/40">
                      {mealNameBySlot.get(occasion.slotKey) ?? 'Planned'}
                    </p>
                  </li>
                ))}
              </ul>
              <Link
                href={APP_ROUTES.plans}
                className="block w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
              >
                Back to Plans
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {actionError ? <p className="text-sm text-red-300">{actionError}</p> : null}
              {!proposal.canAttach ? (
                <p className="text-sm text-white/55">
                  You can still save a meal to your library. It is not added to today’s plan
                  until today is on an active plan.
                </p>
              ) : null}
              <ul className="space-y-2">
                {proposal.occasions.map((occasion) => {
                  const plannedName = mealNameBySlot.get(occasion.slotKey);
                  const isNext = occasion.slotKey === proposal.nextOpenSlotKey;
                  return (
                    <li key={occasion.slotKey}>
                      {occasion.status === 'planned' ? (
                        <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                          <p className="text-sm font-medium text-white">{occasion.label}</p>
                          <p className="text-[11px] text-white/40">
                            {plannedName ?? 'Planned'}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void fillSlot(occasion.slotKey)}
                          className="flex w-full items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3 text-left"
                        >
                          <span>
                            <span className="block text-sm font-medium text-white">
                              {occasion.label}
                            </span>
                            <span className="text-[11px] text-white/40">Open</span>
                          </span>
                          <span className="text-[11px] text-white/40">
                            {isNext ? 'Next' : proposal.canAttach ? 'Plan' : 'Save'}
                          </span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {nextOccasion ? (
                <button
                  type="button"
                  onClick={() => void fillSlot(nextOccasion.slotKey)}
                  className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
                >
                  {proposal.canAttach
                    ? `Plan ${nextOccasion.label}`
                    : `Save ${nextOccasion.label} to library`}
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
