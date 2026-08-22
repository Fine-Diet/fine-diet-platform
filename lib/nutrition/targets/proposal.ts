/**
 * Nutrition Targets v1 — deterministic proposal builder.
 *
 * Mirrors the shape of lib/plans/mealRhythm/assumptionPolicy.ts
 * `proposeMealRhythm`: given current profile + goals state, decide what the
 * first-run UI should show. Never writes.
 */

import { extractBodyInputsFromProfile, type ProfileBodyFields } from './bodyInputs';
import {
  estimateMaintenanceCalories,
  isNutritionTargetsActivityBaseline,
  type NutritionTargetsEstimate,
} from './estimate';
import type { MacroGoals } from '@/lib/journal/types';

export const NUTRITION_TARGETS_POLICY_ID = 'nutrition-targets.assumption' as const;
export const NUTRITION_TARGETS_POLICY_VERSION = 'v1' as const;

export interface NutritionTargetsExistingConfirmed {
  dailyCalorieGoal: number;
  macroGoals: MacroGoals;
  macroGoalsSet: boolean;
}

export interface NutritionTargetsProposal {
  /** True when activity_baseline is not yet known and must be asked before an estimate can be computed. */
  needsActivity: boolean;
  activityBaseline: string | null;
  estimate: NutritionTargetsEstimate;
  /** The user's currently-confirmed target, if any (used to pre-fill the Adjust surface when re-opened from Profile). */
  existingConfirmed: NutritionTargetsExistingConfirmed | null;
  policyId: typeof NUTRITION_TARGETS_POLICY_ID;
  policyVersion: typeof NUTRITION_TARGETS_POLICY_VERSION;
}

export function proposeNutritionTargets(args: {
  profile: ProfileBodyFields & { activity_baseline?: string | null };
  goals: {
    dailyCalorieGoal: number;
    macroGoals: MacroGoals;
    isDefault: boolean;
    macroGoalsSet: boolean;
  } | null;
  now?: Date;
}): NutritionTargetsProposal {
  const now = args.now ?? new Date();
  const bodyInputs = extractBodyInputsFromProfile(args.profile, now);
  const rawActivity = args.profile.activity_baseline ?? null;
  const activityBaseline = isNutritionTargetsActivityBaseline(rawActivity) ? rawActivity : null;

  const estimate = estimateMaintenanceCalories({
    ...bodyInputs,
    activity_baseline: activityBaseline,
  });

  const existingConfirmed =
    args.goals && !args.goals.isDefault
      ? {
          dailyCalorieGoal: args.goals.dailyCalorieGoal,
          macroGoals: args.goals.macroGoals,
          macroGoalsSet: args.goals.macroGoalsSet,
        }
      : null;

  return {
    needsActivity: activityBaseline == null,
    activityBaseline,
    estimate,
    existingConfirmed,
    policyId: NUTRITION_TARGETS_POLICY_ID,
    policyVersion: NUTRITION_TARGETS_POLICY_VERSION,
  };
}
