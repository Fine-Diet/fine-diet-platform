/**
 * Centralized Plans Home next-best-action resolver.
 *
 * Pure and deterministic. Combines existing guidance/pantry/coverage reads.
 * Does not write canonical user state.
 */

import type { PlansMealGuidanceStatus } from '@/lib/plans/home/types';
import { actionKeyFor, headlineKeyFor, supportKeyFor } from './copy';
import { assessForwardCoverage } from './forwardCoveragePolicy';
import {
  PLANS_NBA_RESOLVER_VERSION,
  type DecisionAction,
  type DecisionResult,
  type DayCoverageKind,
  type PantryNbaSignal,
  type PlansNbaStateKey,
} from './types';

export interface PlansNbaDestinations {
  setupMealRhythm: string;
  setupPantry: string;
  planToday: string;
  finishToday: string;
  planAhead: string;
  reviewPlan: string;
  grocery: string | null;
}

export interface ResolvePlansNextBestActionInput {
  guidanceStatus: PlansMealGuidanceStatus;
  hasSchedule: boolean;
  todayCoverage: DayCoverageKind;
  forwardCoveredDayCount: number;
  forwardHorizonDays: number;
  pantry: PantryNbaSignal;
  groceryDemand: boolean;
  destinations: PlansNbaDestinations;
  sources?: DecisionResult['sources'];
}

function action(
  actionId: DecisionAction['actionId'],
  destination: string,
): DecisionAction {
  return {
    actionId,
    destination,
    labelKey: actionKeyFor(actionId),
  };
}

function result(
  partial: Omit<DecisionResult, 'resolverVersion' | 'headlineKey' | 'supportKey'> & {
    stateKey: PlansNbaStateKey;
  },
): DecisionResult {
  return {
    ...partial,
    headlineKey: headlineKeyFor(partial.stateKey),
    supportKey: supportKeyFor(partial.stateKey),
    resolverVersion: PLANS_NBA_RESOLVER_VERSION,
  };
}

function grocerySecondary(
  input: ResolvePlansNextBestActionInput,
): DecisionAction | null {
  if (!input.groceryDemand || !input.destinations.grocery) return null;
  return action('open_grocery', input.destinations.grocery);
}

export function resolvePlansNextBestAction(
  input: ResolvePlansNextBestActionInput,
): DecisionResult {
  if (input.guidanceStatus === 'loading') {
    return result({
      stateKey: 'loading',
      primary: null,
      secondary: null,
      reasonCodes: ['guidance_loading'],
      confidence: 'unknown',
      sources: input.sources,
    });
  }

  if (input.guidanceStatus === 'error') {
    return result({
      stateKey: 'error',
      primary: null,
      secondary: null,
      reasonCodes: ['guidance_error'],
      confidence: 'unknown',
      missingPrerequisites: ['plans_home_guidance'],
      sources: input.sources,
    });
  }

  if (!input.hasSchedule || input.guidanceStatus === 'no_schedule') {
    return result({
      stateKey: 'setup_meal_rhythm',
      primary: action('setup_meal_rhythm', input.destinations.setupMealRhythm),
      secondary: null,
      reasonCodes: ['meal_rhythm_absent'],
      confidence: 'deterministic',
      missingPrerequisites: ['meal_rhythm'],
      sources: input.sources,
    });
  }

  if (input.pantry.kind === 'weak') {
    return result({
      stateKey: 'setup_pantry',
      primary: action('setup_pantry', input.destinations.setupPantry),
      secondary: action('plan_without_pantry', input.destinations.planToday),
      reasonCodes: [`pantry_weak_${input.pantry.reason}`],
      confidence: 'inferred',
      missingPrerequisites: ['pantry_readiness'],
      sources: input.sources,
    });
  }

  const todayUncovered =
    input.guidanceStatus === 'no_active_plan' ||
    input.guidanceStatus === 'out_of_range' ||
    input.todayCoverage === 'empty';

  if (todayUncovered) {
    const reason =
      input.guidanceStatus === 'no_active_plan'
        ? 'no_active_plan'
        : input.guidanceStatus === 'out_of_range'
          ? 'today_out_of_plan_range'
          : 'today_empty';
    return result({
      stateKey: 'plan_today',
      primary: action('plan_today', input.destinations.planToday),
      secondary: grocerySecondary(input),
      reasonCodes: [reason],
      confidence: 'deterministic',
      sources: input.sources,
    });
  }

  if (input.todayCoverage === 'partial') {
    return result({
      stateKey: 'finish_today',
      primary: action('finish_today', input.destinations.finishToday),
      secondary: grocerySecondary(input),
      reasonCodes: ['today_partial'],
      confidence: 'deterministic',
      sources: input.sources,
    });
  }

  if (input.todayCoverage === 'covered') {
    const forward = assessForwardCoverage(input.forwardCoveredDayCount);
    const sources = [
      ...(input.sources ?? []),
      { id: forward.policyId, freshness: forward.policyVersion },
    ];
    if (forward.kind === 'weak') {
      return result({
        stateKey: 'plan_ahead',
        primary: action('plan_ahead', input.destinations.planAhead),
        secondary: grocerySecondary(input),
        reasonCodes: ['today_covered', 'forward_coverage_weak', `${forward.policyId}:${forward.policyVersion}`],
        confidence: 'deterministic',
        sources,
      });
    }
    return result({
      stateKey: 'review_plan',
      primary: action('review_plan', input.destinations.reviewPlan),
      secondary: grocerySecondary(input),
      reasonCodes: ['today_covered', 'forward_coverage_healthy', `${forward.policyId}:${forward.policyVersion}`],
      confidence: 'deterministic',
      sources,
    });
  }

  return result({
    stateKey: 'plan_today',
    primary: action('plan_today', input.destinations.planToday),
    secondary: grocerySecondary(input),
    reasonCodes: ['today_coverage_unknown'],
    confidence: 'unknown',
    sources: input.sources,
  });
}
