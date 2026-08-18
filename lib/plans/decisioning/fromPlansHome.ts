/**
 * Adapter: Plans Home live/fixture reads → NBA resolver input.
 */

import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import type {
  Plan,
  PlanDay,
  PlannedMeal,
  PantryReadinessSummary,
} from '@/lib/plans/types';
import type {
  PlansMealGuidanceViewModel,
  PlansPantryReadinessViewModel,
} from '@/lib/plans/home/types';
import {
  coverageFromRows,
  countForwardCoveredDaysFromMarkers,
  countForwardCoveredDaysFromPlan,
} from './coverage';
import { PLANS_FORWARD_COVERAGE_POLICY } from './forwardCoveragePolicy';
import {
  groceryDemandFromSummary,
  groceryDemandFromViewModel,
  pantrySignalFromSummary,
  pantrySignalFromViewModel,
} from './pantrySignal';
import type { ResolvePlansNextBestActionInput } from './resolvePlansNextBestAction';

export function groceryHrefFromSummary(summary: PantryReadinessSummary | null): string | null {
  if (!summary?.active_plan || !summary.grocery_scope) return null;
  const params = new URLSearchParams({ date: summary.grocery_scope.date_start });
  if (summary.grocery_scope.date_end !== summary.grocery_scope.date_start) {
    params.set('date_end', summary.grocery_scope.date_end);
  }
  return `${APP_ROUTE_BUILDERS.planGrocery(summary.active_plan.id)}?${params.toString()}`;
}

export function buildPlansNbaDestinations(args: {
  today: string;
  planId: string | null;
  groceryHref: string | null;
}): ResolvePlansNextBestActionInput['destinations'] {
  void args.today;
  void args.planId;
  return {
    setupMealRhythm: APP_ROUTES.plansRhythm,
    setupPantry: `${APP_ROUTES.foodPantry}?start=quick`,
    planToday: APP_ROUTES.todayPlan,
    finishToday: APP_ROUTES.todayPlan,
    planAhead: `${APP_ROUTES.plansWeek}?action=generate`,
    reviewPlan: APP_ROUTES.plansWeek,
    grocery: args.groceryHref,
  };
}

export function buildLivePlansNbaInput(args: {
  today: string;
  todayGuidance: PlansMealGuidanceViewModel;
  hasSchedule: boolean;
  days: PlanDay[];
  meals: PlannedMeal[];
  plan: Plan | null;
  pantryLoadState: 'loading' | 'ready' | 'error';
  pantrySummary: PantryReadinessSummary | null;
}): ResolvePlansNextBestActionInput {
  const groceryHref = groceryHrefFromSummary(args.pantrySummary);
  return {
    guidanceStatus: args.todayGuidance.status,
    hasSchedule: args.hasSchedule,
    todayCoverage: coverageFromRows(args.todayGuidance.rows),
    forwardCoveredDayCount: countForwardCoveredDaysFromPlan({
      today: args.today,
      days: args.days,
      meals: args.meals,
      horizonDays: PLANS_FORWARD_COVERAGE_POLICY.horizonDays,
    }),
    forwardHorizonDays: PLANS_FORWARD_COVERAGE_POLICY.horizonDays,
    pantry: pantrySignalFromSummary(args.pantryLoadState, args.pantrySummary),
    groceryDemand: groceryDemandFromSummary(args.pantrySummary),
    destinations: buildPlansNbaDestinations({
      today: args.today,
      planId: args.plan?.id ?? args.todayGuidance.planId,
      groceryHref,
    }),
    sources: [
      { id: 'plans_home_guidance', freshness: args.plan?.updated_at ?? null },
      { id: 'pantry_readiness' },
    ],
  };
}

export function buildFixturePlansNbaInput(args: {
  today: string;
  guidance: PlansMealGuidanceViewModel;
  pantry: PlansPantryReadinessViewModel;
}): ResolvePlansNextBestActionInput {
  return {
    guidanceStatus: args.guidance.status,
    hasSchedule: args.guidance.status !== 'no_schedule',
    todayCoverage: coverageFromRows(args.guidance.rows),
    forwardCoveredDayCount: countForwardCoveredDaysFromMarkers(
      args.guidance.days,
      args.today,
    ),
    forwardHorizonDays: PLANS_FORWARD_COVERAGE_POLICY.horizonDays,
    pantry: pantrySignalFromViewModel(args.pantry),
    groceryDemand: groceryDemandFromViewModel(args.pantry),
    destinations: buildPlansNbaDestinations({
      today: args.today,
      planId: args.guidance.planId,
      groceryHref: args.pantry.columns.find((column) => column.id === 'on_the_list')?.href ?? null,
    }),
  };
}
