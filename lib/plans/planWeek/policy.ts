/**
 * Packet 6 — Simplified Plan Week policy v1.
 *
 * Read-model only. Starts from saved Meal Rhythm + existing planned-meal
 * truth. Does not generate a week, apply templates, or invent occasions.
 * Forward coverage is consumed from plans-nba.forward-coverage v1.
 */

import { coverageFromRows, isPlannedWindowState } from '@/lib/plans/decisioning/coverage';
import {
  assessForwardCoverage,
  PLANS_FORWARD_COVERAGE_POLICY,
  type ForwardCoverageAssessment,
} from '@/lib/plans/decisioning/forwardCoveragePolicy';
import {
  isDateInPlanCoverage,
  mealExecutionToWindowState,
  resolvePlanDateCoverage,
} from '@/lib/plans/home/buildGuidance';
import type { PlansMealGuidanceRow } from '@/lib/plans/home/types';
import { findMealForScheduleSlot } from '@/lib/plans/matchScheduleSlot';
import { addDaysToDateKey } from '@/lib/plans/planDateRange';
import { resolvePlanSlotForCreateKey } from '@/lib/plans/resolvePlanSlotForCreateKey';
import type {
  Plan,
  PlanDay,
  PlannedMeal,
  PlanSlot,
  ResolvedScheduleSlot,
} from '@/lib/plans/types';
import { PLAN_WEEK_RETURN_PATH } from '@/lib/plans/mealCreation/returnPath';
import type { DayCoverageKind } from '@/lib/plans/decisioning/types';

export const PLAN_WEEK_POLICY_ID = 'plan-week.simplified' as const;
export const PLAN_WEEK_POLICY_VERSION = 'v1' as const;
export const PLAN_WEEK_DAY_COUNT = 7 as const;
export { PLAN_WEEK_RETURN_PATH };

export type PlanWeekView = 'missing_rhythm' | 'board' | 'complete' | 'error';
export type PlanWeekOccasionStatus = 'open' | 'planned';

export interface PlanWeekOccasion {
  date: string;
  slotKey: string;
  label: string;
  targetTimeValue: string;
  status: PlanWeekOccasionStatus;
  canAttach: boolean;
  canEnsure: boolean;
}

export interface PlanWeekDay {
  date: string;
  weekdayShort: string;
  inPlanRange: boolean;
  hasPlanDay: boolean;
  attachable: boolean;
  coverage: DayCoverageKind;
  occasions: PlanWeekOccasion[];
  openCount: number;
  plannedCount: number;
}

export interface PlanWeekNextOpen {
  date: string;
  slotKey: string;
  label: string;
  canAttach: boolean;
  canEnsure: boolean;
}

export interface PlanWeekProposal {
  policyId: typeof PLAN_WEEK_POLICY_ID;
  policyVersion: typeof PLAN_WEEK_POLICY_VERSION;
  startDate: string;
  endDate: string;
  view: PlanWeekView;
  days: PlanWeekDay[];
  nextOpen: PlanWeekNextOpen | null;
  openCount: number;
  plannedCount: number;
  attachableOpenCount: number;
  canAttachAny: boolean;
  canEnsureAny: boolean;
  forwardCoverage: ForwardCoverageAssessment;
  reasonCodes: string[];
}

export interface PlanWeekDayInput {
  date: string;
  inPlanRange: boolean;
  hasPlanDay: boolean;
  rows: PlansMealGuidanceRow[];
  attachableSlotKeys: string[];
}

/** Inclusive 7-day horizon starting today (today through today+6). */
export function planWeekHorizon(today: string): {
  start: string;
  end: string;
  dates: string[];
} {
  const dates = Array.from({ length: PLAN_WEEK_DAY_COUNT }, (_, index) =>
    addDaysToDateKey(today, index),
  );
  return {
    start: dates[0]!,
    end: dates[PLAN_WEEK_DAY_COUNT - 1]!,
    dates,
  };
}

export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()]!;
}

function compactTimeLabel(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const hour12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${hour12}:00` : `${hour12}:${String(m).padStart(2, '0')}`;
}

export function rowsForPlanWeekDate(args: {
  date: string;
  scheduleSlots: ResolvedScheduleSlot[];
  days: Array<Pick<PlanDay, 'id' | 'date_local'>>;
  slots: Array<Pick<PlanSlot, 'id' | 'plan_day_id' | 'slot_label' | 'slot_block' | 'target_time'>>;
  meals: Array<
    Pick<
      PlannedMeal,
      'id' | 'plan_day_id' | 'plan_slot_id' | 'name' | 'meal_type' | 'execution_state'
    >
  >;
}): PlansMealGuidanceRow[] {
  const planDay = args.days.find((day) => day.date_local === args.date) ?? null;
  const daySlots = planDay
    ? (args.slots.filter((slot) => slot.plan_day_id === planDay.id) as PlanSlot[])
    : [];
  const dayMeals = planDay
    ? (args.meals.filter((meal) => meal.plan_day_id === planDay.id) as PlannedMeal[])
    : [];

  return args.scheduleSlots.map((slot) => {
    const meal = findMealForScheduleSlot(slot, dayMeals, daySlots);
    return {
      slotKey: slot.key,
      targetTimeLabel: compactTimeLabel(slot.target_time),
      targetTimeValue: slot.target_time,
      label: slot.label,
      mealName: meal?.name ?? null,
      mealId: meal?.id ?? null,
      state: mealExecutionToWindowState(meal),
    };
  });
}

export function attachableSlotKeysForDate(args: {
  date: string;
  scheduleSlots: ResolvedScheduleSlot[];
  days: Array<Pick<PlanDay, 'id' | 'date_local'>>;
  slots: Array<Pick<PlanSlot, 'id' | 'plan_day_id' | 'slot_label' | 'slot_block' | 'target_time'>>;
}): string[] {
  const planDay = args.days.find((day) => day.date_local === args.date) ?? null;
  if (!planDay) return [];
  const daySlots = args.slots.filter((slot) => slot.plan_day_id === planDay.id) as PlanSlot[];
  return args.scheduleSlots
    .filter((slot) =>
      Boolean(
        resolvePlanSlotForCreateKey(slot.key, daySlots, {
          enabledSlots: args.scheduleSlots,
        }),
      ),
    )
    .map((slot) => slot.key);
}

export function buildPlanWeekDaysFromPlan(args: {
  today: string;
  scheduleSlots: ResolvedScheduleSlot[];
  plan: Pick<Plan, 'id' | 'start_date' | 'end_date' | 'plan_shape'> | null;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
}): PlanWeekDayInput[] {
  const horizon = planWeekHorizon(args.today);
  const coverage = args.plan
    ? resolvePlanDateCoverage({ plan: args.plan, days: args.days })
    : null;

  return horizon.dates.map((date) => {
    const inPlanRange = Boolean(coverage && isDateInPlanCoverage(date, coverage));
    const hasPlanDay = args.days.some((day) => day.date_local === date);
    return {
      date,
      inPlanRange,
      hasPlanDay,
      rows: rowsForPlanWeekDate({
        date,
        scheduleSlots: args.scheduleSlots,
        days: args.days,
        slots: args.slots,
        meals: args.meals,
      }),
      attachableSlotKeys:
        args.plan && inPlanRange && hasPlanDay
          ? attachableSlotKeysForDate({
              date,
              scheduleSlots: args.scheduleSlots,
              days: args.days,
              slots: args.slots,
            })
          : [],
    };
  });
}

export function proposePlanWeek(args: {
  today: string;
  hasUsableRhythm: boolean;
  days: PlanWeekDayInput[];
  planId: string | null;
  forwardCoveredDayCount: number;
  loadError?: boolean;
}): PlanWeekProposal {
  const horizon = planWeekHorizon(args.today);
  const forwardCoverage = assessForwardCoverage(
    args.forwardCoveredDayCount,
    PLANS_FORWARD_COVERAGE_POLICY,
  );
  const reasonCodes: string[] = [
    'meal_rhythm_enabled_occasions',
    'packet_3_create_attach',
    `${forwardCoverage.policyId}:${forwardCoverage.policyVersion}`,
  ];

  if (args.loadError) {
    return {
      policyId: PLAN_WEEK_POLICY_ID,
      policyVersion: PLAN_WEEK_POLICY_VERSION,
      startDate: horizon.start,
      endDate: horizon.end,
      view: 'error',
      days: [],
      nextOpen: null,
      openCount: 0,
      plannedCount: 0,
      attachableOpenCount: 0,
      canAttachAny: false,
      canEnsureAny: false,
      forwardCoverage,
      reasonCodes: [...reasonCodes, 'guidance_error'],
    };
  }

  if (!args.hasUsableRhythm) {
    return {
      policyId: PLAN_WEEK_POLICY_ID,
      policyVersion: PLAN_WEEK_POLICY_VERSION,
      startDate: horizon.start,
      endDate: horizon.end,
      view: 'missing_rhythm',
      days: [],
      nextOpen: null,
      openCount: 0,
      plannedCount: 0,
      attachableOpenCount: 0,
      canAttachAny: false,
      canEnsureAny: false,
      forwardCoverage,
      reasonCodes: [...reasonCodes, 'missing_usable_meal_rhythm'],
    };
  }

  const days: PlanWeekDay[] = args.days.map((input) => {
    const occasions: PlanWeekOccasion[] = input.rows.map((row) => {
      const planned = isPlannedWindowState(row.state);
      const canAttach =
        Boolean(args.planId) &&
        input.inPlanRange &&
        input.hasPlanDay &&
        input.attachableSlotKeys.includes(row.slotKey) &&
        !planned;
      const canEnsure =
        Boolean(args.planId) && input.inPlanRange && !planned && !canAttach;
      return {
        date: input.date,
        slotKey: row.slotKey,
        label: row.label,
        targetTimeValue: row.targetTimeValue,
        status: planned ? 'planned' : 'open',
        canAttach,
        canEnsure,
      };
    });
    const open = occasions.filter((item) => item.status === 'open');
    const planned = occasions.filter((item) => item.status === 'planned');
    return {
      date: input.date,
      weekdayShort: weekdayShort(input.date),
      inPlanRange: input.inPlanRange,
      hasPlanDay: input.hasPlanDay,
      attachable: Boolean(args.planId) && input.inPlanRange && input.hasPlanDay,
      coverage: coverageFromRows(input.rows),
      occasions,
      openCount: open.length,
      plannedCount: planned.length,
    };
  });

  const openOccasions = days.flatMap((day) =>
    day.occasions.filter((item) => item.status === 'open'),
  );
  const plannedOccasions = days.flatMap((day) =>
    day.occasions.filter((item) => item.status === 'planned'),
  );
  const attachableOpen = openOccasions.filter((item) => item.canAttach);
  const ensurableOpen = openOccasions.filter((item) => item.canEnsure);
  const fillableOpen = openOccasions.filter((item) => item.canAttach || item.canEnsure);
  const canAttachAny = days.some((day) => day.attachable);
  const canEnsureAny = ensurableOpen.length > 0;
  const nextOpenOccasion =
    attachableOpen[0] ?? ensurableOpen[0] ?? openOccasions[0] ?? null;
  const nextOpen: PlanWeekNextOpen | null = nextOpenOccasion
    ? {
        date: nextOpenOccasion.date,
        slotKey: nextOpenOccasion.slotKey,
        label: nextOpenOccasion.label,
        canAttach: nextOpenOccasion.canAttach,
        canEnsure: nextOpenOccasion.canEnsure,
      }
    : null;

  if (!args.planId) {
    reasonCodes.push('no_active_plan_attach_deferred');
  } else if (!canAttachAny && !canEnsureAny) {
    reasonCodes.push('week_outside_active_plan');
  } else {
    reasonCodes.push('canonical_planned_meal_attach');
  }

  if (forwardCoverage.kind === 'healthy') {
    reasonCodes.push('forward_coverage_healthy');
  } else {
    reasonCodes.push('forward_coverage_weak');
  }

  const attachableComplete =
    (canAttachAny || canEnsureAny) && fillableOpen.length === 0;

  if (attachableComplete) {
    reasonCodes.push('week_attachable_occasions_planned');
  } else if (openOccasions.length > 0) {
    reasonCodes.push('week_remaining_open_occasions');
  }

  return {
    policyId: PLAN_WEEK_POLICY_ID,
    policyVersion: PLAN_WEEK_POLICY_VERSION,
    startDate: horizon.start,
    endDate: horizon.end,
    view: attachableComplete ? 'complete' : 'board',
    days,
    nextOpen,
    openCount: openOccasions.length,
    plannedCount: plannedOccasions.length,
    attachableOpenCount: attachableOpen.length,
    canAttachAny,
    canEnsureAny,
    forwardCoverage,
    reasonCodes,
  };
}
