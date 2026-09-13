import { selectPlansHomePlanningTarget } from '@/lib/plans/home/planningTarget';
import {
  collectPlannedMealsForScheduleSlotAcrossPlans,
} from '@/lib/plans/matchScheduleSlot';
import type {
  Plan,
  PlannedMeal,
  PlanSlot,
  ResolvedScheduleSlot,
} from '@/lib/plans/types';

export interface PlannedMealContextReadClient {
  list(): Promise<Plan[]>;
  getDayDetail(
    planId: string,
    date: string,
  ): Promise<{ meals: PlannedMeal[]; slots: PlanSlot[] }>;
  getMeal(
    mealId: string,
    options: { date: string },
  ): Promise<{ meal: PlannedMeal; date_local: string } | null>;
}

export type PlannedMealContextDiagnostic =
  | { kind: 'empty'; phase: 'selection' | 'matching'; planId?: string }
  | { kind: 'not_found'; phase: 'explicit_meal'; plannedMealId: string }
  | {
      kind: 'retrieval_error';
      phase: 'plan_list' | 'day_detail' | 'explicit_meal';
      message: string;
      planId?: string;
      plannedMealId?: string;
    };

export type PlannedMealContextResolution =
  | {
      status: 'resolved';
      meals: PlannedMeal[];
      planId: string | null;
      diagnostic: null;
    }
  | {
      status: 'empty';
      meals: [];
      planId: string | null;
      diagnostic: Extract<PlannedMealContextDiagnostic, { kind: 'empty' }>;
    }
  | {
      status: 'not_found';
      meals: [];
      planId: null;
      diagnostic: Extract<PlannedMealContextDiagnostic, { kind: 'not_found' }>;
    }
  | {
      status: 'error';
      meals: [];
      planId: string | null;
      diagnostic: Extract<
        PlannedMealContextDiagnostic,
        { kind: 'retrieval_error' }
      >;
    };

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Unknown retrieval failure';
}

/**
 * Resolve the same persisted dated Plan target used by Plans Home, then match
 * its structural slot. Explicit plannedMealId bypasses generic Plan/slot
 * discovery and remains authoritative for Quick Log.
 */
export async function resolvePlannedMealContext(
  input: {
    dateKey: string;
    mealSlot: ResolvedScheduleSlot | null;
    scheduleSlots?: ResolvedScheduleSlot[];
    explicitPlannedMealId?: string | null;
  },
  client: PlannedMealContextReadClient,
): Promise<PlannedMealContextResolution> {
  const explicitPlannedMealId = input.explicitPlannedMealId ?? null;
  if (explicitPlannedMealId) {
    try {
      const result = await client.getMeal(explicitPlannedMealId, {
        date: input.dateKey,
      });
      if (!result) {
        return {
          status: 'not_found',
          meals: [],
          planId: null,
          diagnostic: {
            kind: 'not_found',
            phase: 'explicit_meal',
            plannedMealId: explicitPlannedMealId,
          },
        };
      }
      return {
        status: 'resolved',
        meals: [result.meal],
        planId: result.meal.plan_id,
        diagnostic: null,
      };
    } catch (cause) {
      return {
        status: 'error',
        meals: [],
        planId: null,
        diagnostic: {
          kind: 'retrieval_error',
          phase: 'explicit_meal',
          plannedMealId: explicitPlannedMealId,
          message: errorMessage(cause),
        },
      };
    }
  }

  if (!input.mealSlot) {
    return {
      status: 'empty',
      meals: [],
      planId: null,
      diagnostic: { kind: 'empty', phase: 'selection' },
    };
  }

  let plans: Plan[];
  try {
    plans = await client.list();
  } catch (cause) {
    return {
      status: 'error',
      meals: [],
      planId: null,
      diagnostic: {
        kind: 'retrieval_error',
        phase: 'plan_list',
        message: errorMessage(cause),
      },
    };
  }

  const target = selectPlansHomePlanningTarget(plans, input.dateKey);
  if (!target) {
    return {
      status: 'empty',
      meals: [],
      planId: null,
      diagnostic: { kind: 'empty', phase: 'selection' },
    };
  }

  let detail: { meals: PlannedMeal[]; slots: PlanSlot[] };
  try {
    detail = await client.getDayDetail(target.plan.id, input.dateKey);
  } catch (cause) {
    return {
      status: 'error',
      meals: [],
      planId: target.plan.id,
      diagnostic: {
        kind: 'retrieval_error',
        phase: 'day_detail',
        planId: target.plan.id,
        message: errorMessage(cause),
      },
    };
  }

  const meals = collectPlannedMealsForScheduleSlotAcrossPlans(
    input.mealSlot,
    [{ planId: target.plan.id, meals: detail.meals, slots: detail.slots }],
    input.scheduleSlots,
  );
  if (meals.length === 0) {
    return {
      status: 'empty',
      meals: [],
      planId: target.plan.id,
      diagnostic: {
        kind: 'empty',
        phase: 'matching',
        planId: target.plan.id,
      },
    };
  }
  return {
    status: 'resolved',
    meals,
    planId: target.plan.id,
    diagnostic: null,
  };
}
