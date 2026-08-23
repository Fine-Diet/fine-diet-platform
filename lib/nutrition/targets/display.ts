/**
 * Nutrition Targets v1 — Log-home unset-target display semantics.
 *
 * Pure helpers so the "of —" vs. confirmed-number decision (governing doc
 * "Log-home unset-target state") is one small, testable place rather than
 * inline conditionals duplicated across pages/journal.tsx and
 * JournalHeroSection.tsx.
 *
 * Rules:
 *  - `isDefault` true  → no calorie target has ever been confirmed; show "—"
 *    everywhere a calorie goal would render, and never surface fallback
 *    numbers as if they were a real target.
 *  - `macroGoalsSet` is independent of `isDefault` (Nutrition Targets v1 §7:
 *    macros are optional) — a user can confirm calories only and leave
 *    macros unset, in which case macros still render "—" even though
 *    calories are confirmed.
 */

import type { MacroGoals, UserGoals } from '@/lib/journal/types';

export function hasConfirmedCalorieTarget(goals: UserGoals): boolean {
  return !goals.isDefault;
}

export function hasConfirmedMacroTargets(goals: UserGoals): boolean {
  return !goals.isDefault && goals.macroGoalsSet;
}

/** Daily calorie goal to display, or undefined when nothing has been confirmed yet ("—"). */
export function deriveDailyGoalForDisplay(goals: UserGoals): number | undefined {
  return hasConfirmedCalorieTarget(goals) ? goals.dailyCalorieGoal : undefined;
}

/** A single macro goal to display, or null when macros haven't been confirmed yet ("—"). */
export function deriveMacroGoalForDisplay(goals: UserGoals, key: keyof MacroGoals): number | null {
  return hasConfirmedMacroTargets(goals) ? goals.macroGoals[key] : null;
}
