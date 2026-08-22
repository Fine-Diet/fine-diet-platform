/**
 * Nutrition Targets v1 — Log-home unset-target display semantics.
 *
 * Locks in the "of —" behavior from the founder-approved screenshot: actual
 * intake always displays; target denominators render unset until the user
 * has explicitly confirmed them, and macros are independently optional even
 * once calories are confirmed.
 */

import type { UserGoals } from '@/lib/journal/types';
import {
  deriveDailyGoalForDisplay,
  deriveMacroGoalForDisplay,
  hasConfirmedCalorieTarget,
  hasConfirmedMacroTargets,
} from '../display';

const UNSET_GOALS: UserGoals = {
  dailyCalorieGoal: 2500,
  macroGoals: { protein_g: 150, carbs_g: 250, fat_g: 80 },
  isDefault: true,
  macroGoalsSet: false,
  provenance: null,
};

const CALORIES_ONLY_CONFIRMED: UserGoals = {
  dailyCalorieGoal: 2200,
  macroGoals: { protein_g: 150, carbs_g: 250, fat_g: 80 }, // fallback numbers, not a confirmed target
  isDefault: false,
  macroGoalsSet: false,
  provenance: { source: 'user_confirmed', estimatedCalories: 2200, modelVersion: 'x', activityBaseline: 'sedentary', bodyInputsUsedAt: null, confirmedAt: '2026-08-22T00:00:00.000Z' },
};

const FULLY_CONFIRMED: UserGoals = {
  dailyCalorieGoal: 2200,
  macroGoals: { protein_g: 160, carbs_g: 200, fat_g: 70 },
  isDefault: false,
  macroGoalsSet: true,
  provenance: { source: 'user_edited', estimatedCalories: 2200, modelVersion: 'x', activityBaseline: 'sedentary', bodyInputsUsedAt: null, confirmedAt: '2026-08-22T00:00:00.000Z' },
};

describe('hasConfirmedCalorieTarget / hasConfirmedMacroTargets', () => {
  it('is false for both on the never-set state (isDefault)', () => {
    expect(hasConfirmedCalorieTarget(UNSET_GOALS)).toBe(false);
    expect(hasConfirmedMacroTargets(UNSET_GOALS)).toBe(false);
  });

  it('calories can be confirmed while macros remain unset — they are independent (§7 macros optional)', () => {
    expect(hasConfirmedCalorieTarget(CALORIES_ONLY_CONFIRMED)).toBe(true);
    expect(hasConfirmedMacroTargets(CALORIES_ONLY_CONFIRMED)).toBe(false);
  });

  it('is true for both once the user has confirmed calories and macros', () => {
    expect(hasConfirmedCalorieTarget(FULLY_CONFIRMED)).toBe(true);
    expect(hasConfirmedMacroTargets(FULLY_CONFIRMED)).toBe(true);
  });

  it('macroGoalsSet alone (without isDefault=false) never counts as confirmed — isDefault always gates', () => {
    const contradictory: UserGoals = { ...UNSET_GOALS, macroGoalsSet: true };
    expect(hasConfirmedMacroTargets(contradictory)).toBe(false);
  });
});

describe('deriveDailyGoalForDisplay', () => {
  it('is undefined ("—") when no calorie target has ever been confirmed', () => {
    expect(deriveDailyGoalForDisplay(UNSET_GOALS)).toBeUndefined();
  });

  it('never surfaces the DEFAULT_GOALS fallback number as if it were a real target', () => {
    // UNSET_GOALS.dailyCalorieGoal happens to carry the same fallback number
    // client code uses before a real target exists; display must still be "—".
    expect(UNSET_GOALS.dailyCalorieGoal).toBe(2500);
    expect(deriveDailyGoalForDisplay(UNSET_GOALS)).toBeUndefined();
  });

  it('returns the confirmed number once the user has set a target', () => {
    expect(deriveDailyGoalForDisplay(CALORIES_ONLY_CONFIRMED)).toBe(2200);
    expect(deriveDailyGoalForDisplay(FULLY_CONFIRMED)).toBe(2200);
  });
});

describe('deriveMacroGoalForDisplay', () => {
  it('is null ("—") for every macro when nothing is confirmed at all', () => {
    expect(deriveMacroGoalForDisplay(UNSET_GOALS, 'protein_g')).toBeNull();
    expect(deriveMacroGoalForDisplay(UNSET_GOALS, 'carbs_g')).toBeNull();
    expect(deriveMacroGoalForDisplay(UNSET_GOALS, 'fat_g')).toBeNull();
  });

  it('is null ("—") for every macro when calories are confirmed but macros were left unset', () => {
    expect(deriveMacroGoalForDisplay(CALORIES_ONLY_CONFIRMED, 'protein_g')).toBeNull();
    expect(deriveMacroGoalForDisplay(CALORIES_ONLY_CONFIRMED, 'carbs_g')).toBeNull();
    expect(deriveMacroGoalForDisplay(CALORIES_ONLY_CONFIRMED, 'fat_g')).toBeNull();
  });

  it('returns the confirmed gram value per macro once macros are explicitly set', () => {
    expect(deriveMacroGoalForDisplay(FULLY_CONFIRMED, 'protein_g')).toBe(160);
    expect(deriveMacroGoalForDisplay(FULLY_CONFIRMED, 'carbs_g')).toBe(200);
    expect(deriveMacroGoalForDisplay(FULLY_CONFIRMED, 'fat_g')).toBe(70);
  });
});
