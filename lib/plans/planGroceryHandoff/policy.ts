/**
 * Packet 9 — explicit Plan Week → Grocery range handoff.
 *
 * Presentation/range policy only. Grocery derivation stays in
 * `generateGroceryList`. This module never invents demand from Meal Rhythm,
 * open occasions, library-only meals, or structural slots.
 */

import { resolvePlanDateCoverage } from '@/lib/plans/home/buildGuidance';
import { isRealCalendarDateKey } from '@/lib/plans/planDateRange';
import { planWeekHorizon } from '@/lib/plans/planWeek/policy';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import type { GroceryActiveListSelectionKind, Plan, PlanDay, PlannedMeal } from '@/lib/plans/types';

export const PLAN_GROCERY_HANDOFF_POLICY_ID = 'plan-grocery-handoff.explicit' as const;
export const PLAN_GROCERY_HANDOFF_POLICY_VERSION = 'v1' as const;

export type PlanGroceryHandoffReasonCode =
  | 'explicit_plan_week_handoff'
  | 'range_clamped_to_plan'
  | 'user_changed_range'
  | 'no_active_plan'
  | 'no_range_overlap'
  | 'outside_plan_coverage'
  | 'invalid_dates'
  | 'end_before_start'
  | 'no_planned_demand'
  | 'existing_list_reused'
  | 'generated_exact_scope'
  | 'destructive_regenerate_held'
  | 'generation_failed';

export type PlanGroceryRangeClampKind =
  | 'none'
  | 'plan_start'
  | 'plan_end'
  | 'plan_start_and_end';

export interface PlanGroceryRangeProposal {
  policyId: typeof PLAN_GROCERY_HANDOFF_POLICY_ID;
  policyVersion: typeof PLAN_GROCERY_HANDOFF_POLICY_VERSION;
  dateStart: string;
  dateEnd: string;
  visibleStart: string;
  visibleEnd: string;
  planStart: string;
  planEnd: string;
  hasOverlap: boolean;
  clamped: boolean;
  clampKind: PlanGroceryRangeClampKind;
  reasonCodes: PlanGroceryHandoffReasonCode[];
}

export type PlanGroceryHandoffDecision =
  | {
      action: 'commit';
      dateStart: string;
      dateEnd: string;
      plannedMealCount: number;
      rangeChanged: boolean;
      reasonCodes: PlanGroceryHandoffReasonCode[];
    }
  | {
      action: 'no_planned_demand';
      dateStart: string;
      dateEnd: string;
      plannedMealCount: 0;
      rangeChanged: boolean;
      reasonCodes: PlanGroceryHandoffReasonCode[];
    }
  | {
      action: 'reject';
      dateStart: string | null;
      dateEnd: string | null;
      plannedMealCount: number;
      rangeChanged: boolean;
      reasonCodes: PlanGroceryHandoffReasonCode[];
    };

export type PlanGroceryGenerateOutcome = 'reused' | 'generated';

export function proposePlanGroceryRange(args: {
  today: string;
  plan: Pick<Plan, 'start_date' | 'end_date' | 'plan_shape'> | null;
  days: Array<Pick<PlanDay, 'date_local'>>;
}): PlanGroceryRangeProposal | null {
  const visible = planWeekHorizon(args.today);
  if (!args.plan) return null;

  const coverage = resolvePlanDateCoverage({ plan: args.plan, days: args.days });
  const dateStart = visible.start > coverage.start ? visible.start : coverage.start;
  const dateEnd = visible.end < coverage.end ? visible.end : coverage.end;
  const hasOverlap = dateStart <= dateEnd;
  const clampKind = clampKindFor(visible.start, visible.end, coverage.start, coverage.end, hasOverlap);
  const reasonCodes: PlanGroceryHandoffReasonCode[] = ['explicit_plan_week_handoff'];
  if (!hasOverlap) reasonCodes.push('no_range_overlap');
  if (hasOverlap && clampKind !== 'none') reasonCodes.push('range_clamped_to_plan');

  return {
    policyId: PLAN_GROCERY_HANDOFF_POLICY_ID,
    policyVersion: PLAN_GROCERY_HANDOFF_POLICY_VERSION,
    dateStart: hasOverlap ? dateStart : coverage.start,
    dateEnd: hasOverlap ? dateEnd : coverage.end,
    visibleStart: visible.start,
    visibleEnd: visible.end,
    planStart: coverage.start,
    planEnd: coverage.end,
    hasOverlap,
    clamped: hasOverlap && clampKind !== 'none',
    clampKind,
    reasonCodes,
  };
}

function clampKindFor(
  visibleStart: string,
  visibleEnd: string,
  planStart: string,
  planEnd: string,
  hasOverlap: boolean,
): PlanGroceryRangeClampKind {
  if (!hasOverlap) return 'none';
  const startClamped = visibleStart < planStart;
  const endClamped = visibleEnd > planEnd;
  if (startClamped && endClamped) return 'plan_start_and_end';
  if (startClamped) return 'plan_start';
  if (endClamped) return 'plan_end';
  return 'none';
}

export function countCanonicalPlannedMealsInRange(args: {
  days: Array<Pick<PlanDay, 'id' | 'date_local'>>;
  meals: Array<Pick<PlannedMeal, 'plan_day_id'>>;
  dateStart: string;
  dateEnd: string;
}): number {
  const dayIds = new Set(
    args.days
      .filter((day) => day.date_local >= args.dateStart && day.date_local <= args.dateEnd)
      .map((day) => day.id),
  );
  return args.meals.filter((meal) => dayIds.has(meal.plan_day_id)).length;
}

export function evaluatePlanGroceryHandoff(args: {
  plan: Pick<Plan, 'id' | 'start_date' | 'end_date' | 'plan_shape'> | null;
  days: Array<Pick<PlanDay, 'id' | 'date_local'>>;
  meals: Array<Pick<PlannedMeal, 'plan_day_id'>>;
  proposed: PlanGroceryRangeProposal | null;
  dateStart: string;
  dateEnd: string;
}): PlanGroceryHandoffDecision {
  if (!args.plan || !args.proposed) {
    return {
      action: 'reject',
      dateStart: args.dateStart || null,
      dateEnd: args.dateEnd || null,
      plannedMealCount: 0,
      rangeChanged: false,
      reasonCodes: ['no_active_plan'],
    };
  }

  if (!isRealCalendarDateKey(args.dateStart) || !isRealCalendarDateKey(args.dateEnd)) {
    return {
      action: 'reject',
      dateStart: args.dateStart || null,
      dateEnd: args.dateEnd || null,
      plannedMealCount: 0,
      rangeChanged: rangeChanged(args.proposed, args.dateStart, args.dateEnd),
      reasonCodes: ['invalid_dates'],
    };
  }

  if (args.dateEnd < args.dateStart) {
    return {
      action: 'reject',
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      plannedMealCount: 0,
      rangeChanged: rangeChanged(args.proposed, args.dateStart, args.dateEnd),
      reasonCodes: ['end_before_start'],
    };
  }

  if (args.dateStart < args.proposed.planStart || args.dateEnd > args.proposed.planEnd) {
    return {
      action: 'reject',
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      plannedMealCount: 0,
      rangeChanged: rangeChanged(args.proposed, args.dateStart, args.dateEnd),
      reasonCodes: ['outside_plan_coverage'],
    };
  }

  const plannedMealCount = countCanonicalPlannedMealsInRange({
    days: args.days,
    meals: args.meals,
    dateStart: args.dateStart,
    dateEnd: args.dateEnd,
  });
  const changed = rangeChanged(args.proposed, args.dateStart, args.dateEnd);
  const reasonCodes: PlanGroceryHandoffReasonCode[] = ['explicit_plan_week_handoff', 'destructive_regenerate_held'];
  if (args.proposed.clamped && !changed) reasonCodes.push('range_clamped_to_plan');
  if (changed) reasonCodes.push('user_changed_range');

  if (plannedMealCount === 0) {
    return {
      action: 'no_planned_demand',
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      plannedMealCount: 0,
      rangeChanged: changed,
      reasonCodes: [...reasonCodes, 'no_planned_demand'],
    };
  }

  return {
    action: 'commit',
    dateStart: args.dateStart,
    dateEnd: args.dateEnd,
    plannedMealCount,
    rangeChanged: changed,
    reasonCodes,
  };
}

function rangeChanged(
  proposed: PlanGroceryRangeProposal,
  dateStart: string,
  dateEnd: string,
): boolean {
  return dateStart !== proposed.dateStart || dateEnd !== proposed.dateEnd;
}

export function classifyGroceryGenerateOutcome(
  selectionKind: GroceryActiveListSelectionKind,
): PlanGroceryGenerateOutcome {
  if (
    selectionKind === 'generated_exact_day' ||
    selectionKind === 'generated_exact_range'
  ) {
    return 'generated';
  }
  return 'reused';
}

export function planGroceryHandoffHref(args: {
  listId: string;
  requestedStart: string;
  requestedEnd: string;
  selectionKind: GroceryActiveListSelectionKind;
}): string {
  const href = APP_ROUTE_BUILDERS.foodGroceryList(args.listId);
  if (args.selectionKind !== 'containing_range') return href;
  const params = new URLSearchParams({
    requested_start: args.requestedStart,
    requested_end: args.requestedEnd,
  });
  return `${href}?${params.toString()}`;
}

export function formatContainingRangeCopy(args: {
  requestedStart: string;
  requestedEnd: string;
  activeStart: string | null;
  activeEnd: string | null;
}): string {
  const activeStart = args.activeStart ?? args.requestedStart;
  const activeEnd = args.activeEnd ?? args.requestedEnd;
  return `Requested ${args.requestedStart} to ${args.requestedEnd}. Showing the existing grocery list for ${activeStart} to ${activeEnd}.`;
}

export function formatStoredGroceryRange(args: {
  dateStart: string | null;
  dateEnd: string | null;
}): string | null {
  if (!args.dateStart) return null;
  if (!args.dateEnd || args.dateEnd === args.dateStart) return args.dateStart;
  return `${args.dateStart} to ${args.dateEnd}`;
}

export function formatPlanGroceryClampCopy(proposal: PlanGroceryRangeProposal): string | null {
  if (!proposal.hasOverlap) {
    return 'This week is outside your current plan, so Fine Diet will not claim those days.';
  }
  if (proposal.clampKind === 'plan_end' || proposal.clampKind === 'plan_start_and_end') {
    return `Proposed range ends ${proposal.dateEnd} because that is the end of your current plan.`;
  }
  if (proposal.clampKind === 'plan_start') {
    return `Proposed range starts ${proposal.dateStart} because that is the start of your current plan.`;
  }
  return null;
}

export function formatNoPlannedDemandCopy(): string {
  return 'There are no planned meals in this range. Open occasions and library-only meals do not create a grocery list.';
}
