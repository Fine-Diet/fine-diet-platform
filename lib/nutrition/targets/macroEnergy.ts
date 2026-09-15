/**
 * Calorie ↔ macro target energy math.
 *
 * Calories are the energy budget. Canonical macros remain whole-gram
 * `protein_g` / `carbs_g` / `fat_g`. Percentages are derived and never stored.
 *
 * Alignment: |protein*4 + carbs*4 + fat*9 − dailyCalorieGoal| ≤ 10 kcal.
 */

import type { MacroGoals } from '@/lib/journal/types';

export const PROTEIN_KCAL_PER_G = 4;
export const CARBS_KCAL_PER_G = 4;
export const FAT_KCAL_PER_G = 9;
export const ALIGNMENT_TOLERANCE_KCAL = 10;

export const MACRO_GRAM_KEYS = ['protein_g', 'carbs_g', 'fat_g'] as const;
export type MacroGramsKey = (typeof MACRO_GRAM_KEYS)[number];

export const KCAL_PER_GRAM: Record<MacroGramsKey, number> = {
  protein_g: PROTEIN_KCAL_PER_G,
  carbs_g: CARBS_KCAL_PER_G,
  fat_g: FAT_KCAL_PER_G,
};

export type MacroLockKey = 'protein' | 'carbs' | 'fat';
export type MacroLocks = Record<MacroLockKey, boolean>;

export const GRAM_KEY_TO_LOCK: Record<MacroGramsKey, MacroLockKey> = {
  protein_g: 'protein',
  carbs_g: 'carbs',
  fat_g: 'fat',
};

export const LOCK_TO_GRAM_KEY: Record<MacroLockKey, MacroGramsKey> = {
  protein: 'protein_g',
  carbs: 'carbs_g',
  fat: 'fat_g',
};

/**
 * Unconfirmed fallback macros, internally coherent with the 2500 kcal
 * fallback calorie goal. These are NOT a recommendation policy.
 *
 * Historical pair was 2500 kcal + 150P / 250C / 80F (2320 macro kcal).
 * This set is that same energy ratio, 0-lock scaled to 2500 kcal, then
 * rounded to whole grams (162P / 269C / 86F → 2498 kcal).
 */
export const UNCONFIRMED_FALLBACK_CALORIE_GOAL = 2500;
export const UNCONFIRMED_FALLBACK_MACRO_GOALS: MacroGoals = {
  protein_g: 162,
  carbs_g: 269,
  fat_g: 86,
};

export const LOCKED_MACROS_EXCEED_MESSAGE =
  'Locked macros exceed your calorie target. Adjust calories or unlock a macro.';

export const MACRO_ALIGNMENT_MESSAGE =
  'Macro targets must be within 10 calories of your daily calorie goal.';

export const CALORIE_BOUNDS_MESSAGE = 'Enter a calorie target between 500 and 10,000.';
export const MACRO_NUMERIC_MESSAGE = 'Macro targets must be zero or a positive number.';

export const MIN_DAILY_CALORIE_GOAL = 500;
export const MAX_DAILY_CALORIE_GOAL = 10000;

export type RebalanceIntent = 'balance' | 'propagate';

export type RebalanceFailureReason =
  | 'locked_exceed_target'
  | 'no_valid_solution'
  | 'degenerate_ratio'
  | 'three_locks_mismatch'
  | 'negative_grams';

export type RebalanceResult =
  | { ok: true; macros: MacroGoals; aligned: boolean; changed: boolean }
  | {
      ok: false;
      reason: RebalanceFailureReason;
      message: string;
      macros: MacroGoals;
    };

export class NutritionGoalIntegrityError extends Error {
  readonly code = 'calorie_macro_mismatch';
  readonly status = 400;

  constructor(message: string = MACRO_ALIGNMENT_MESSAGE) {
    super(message);
    this.name = 'NutritionGoalIntegrityError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function emptyMacroLocks(): MacroLocks {
  return { protein: false, carbs: false, fat: false };
}

export function cloneMacroGoals(macros: MacroGoals): MacroGoals {
  return {
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
  };
}

export function caloriesForGrams(key: MacroGramsKey, grams: number): number {
  return grams * KCAL_PER_GRAM[key];
}

export function totalMacroCalories(macros: MacroGoals): number {
  return (
    caloriesForGrams('protein_g', macros.protein_g) +
    caloriesForGrams('carbs_g', macros.carbs_g) +
    caloriesForGrams('fat_g', macros.fat_g)
  );
}

export function calorieGap(dailyCalorieGoal: number, macros: MacroGoals): number {
  return totalMacroCalories(macros) - dailyCalorieGoal;
}

export function isCalorieMacroAligned(dailyCalorieGoal: number, macros: MacroGoals): boolean {
  return Math.abs(calorieGap(dailyCalorieGoal, macros)) <= ALIGNMENT_TOLERANCE_KCAL;
}

export function percentageOfBudget(
  dailyCalorieGoal: number,
  key: MacroGramsKey,
  grams: number,
): number {
  if (!(dailyCalorieGoal > 0)) return 0;
  return (caloriesForGrams(key, grams) / dailyCalorieGoal) * 100;
}

export function gramsFromPercentage(
  dailyCalorieGoal: number,
  key: MacroGramsKey,
  percent: number,
): number {
  return ((percent / 100) * dailyCalorieGoal) / KCAL_PER_GRAM[key];
}

export function roundToWholeGrams(grams: number): number {
  return Math.round(grams);
}

export function classifyMacroCompleteness(
  macros: Partial<MacroGoals> | null | undefined,
): 'unset' | 'complete' | 'partial' | 'invalid' {
  if (!macros) return 'unset';
  const values = MACRO_GRAM_KEYS.map((key) => macros[key]);
  const present = values.filter((value) => value !== undefined && value !== null && Number.isFinite(value));
  if (present.length === 0) return 'unset';
  if (present.length < 3) return 'partial';
  if (present.some((value) => (value as number) < 0)) return 'invalid';
  return 'complete';
}

export function isDailyCalorieGoalInBounds(dailyCalorieGoal: number): boolean {
  return (
    Number.isFinite(dailyCalorieGoal) &&
    dailyCalorieGoal >= MIN_DAILY_CALORIE_GOAL &&
    dailyCalorieGoal <= MAX_DAILY_CALORIE_GOAL
  );
}

/**
 * Validate a *resulting* confirmed calorie + optional-macro state.
 * `macroGoals === null` means macros are unset (explicit clear or never set).
 */
export function validateMergedGoalState(
  dailyCalorieGoal: number,
  macroGoals: MacroGoals | null,
  options: { enforceCalorieBounds?: boolean } = {},
): void {
  const enforceCalorieBounds = options.enforceCalorieBounds ?? true;
  if (enforceCalorieBounds && !isDailyCalorieGoalInBounds(dailyCalorieGoal)) {
    throw new NutritionGoalIntegrityError(CALORIE_BOUNDS_MESSAGE);
  }
  if (macroGoals == null) return;
  for (const value of Object.values(macroGoals)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new NutritionGoalIntegrityError(MACRO_NUMERIC_MESSAGE);
    }
  }
  if (!isCalorieMacroAligned(dailyCalorieGoal, macroGoals)) {
    throw new NutritionGoalIntegrityError(MACRO_ALIGNMENT_MESSAGE);
  }
}

function lockedGramKeys(locks: MacroLocks, driver?: MacroGramsKey): MacroGramsKey[] {
  return MACRO_GRAM_KEYS.filter((key) => locks[GRAM_KEY_TO_LOCK[key]] || driver === key);
}

function freeGramKeys(locks: MacroLocks, driver?: MacroGramsKey): MacroGramsKey[] {
  return MACRO_GRAM_KEYS.filter((key) => !locks[GRAM_KEY_TO_LOCK[key]] && driver !== key);
}

export function lockedMacroCalories(
  macros: MacroGoals,
  locks: MacroLocks,
): number {
  return MACRO_GRAM_KEYS.reduce((sum, key) => {
    return locks[GRAM_KEY_TO_LOCK[key]] ? sum + caloriesForGrams(key, macros[key]) : sum;
  }, 0);
}

export function lockedCaloriesExceedTarget(
  dailyCalorieGoal: number,
  macros: MacroGoals,
  locks: MacroLocks,
): boolean {
  return lockedMacroCalories(macros, locks) > dailyCalorieGoal + ALIGNMENT_TOLERANCE_KCAL;
}

function fail(
  reason: RebalanceFailureReason,
  macros: MacroGoals,
  message?: string,
): RebalanceResult {
  const resolved =
    message ??
    (reason === 'locked_exceed_target'
      ? LOCKED_MACROS_EXCEED_MESSAGE
      : reason === 'three_locks_mismatch'
        ? LOCKED_MACROS_EXCEED_MESSAGE
        : 'No valid macro balance exists for this calorie target.');
  return { ok: false, reason, message: resolved, macros: cloneMacroGoals(macros) };
}

function macrosEqual(a: MacroGoals, b: MacroGoals): boolean {
  return a.protein_g === b.protein_g && a.carbs_g === b.carbs_g && a.fat_g === b.fat_g;
}

function nudgeWholeGrams(
  macros: MacroGoals,
  adjustable: MacroGramsKey[],
  dailyCalorieGoal: number,
): MacroGoals {
  const next = cloneMacroGoals(macros);
  for (let step = 0; step < 80; step += 1) {
    const gap = calorieGap(dailyCalorieGoal, next);
    if (Math.abs(gap) <= ALIGNMENT_TOLERANCE_KCAL) return next;
    const direction = gap > 0 ? -1 : 1;
    let bestKey: MacroGramsKey | null = null;
    let bestAbs = Math.abs(gap);
    for (const key of adjustable) {
      const candidateGrams = next[key] + direction;
      if (candidateGrams < 0) continue;
      const candidate = { ...next, [key]: candidateGrams };
      const abs = Math.abs(calorieGap(dailyCalorieGoal, candidate));
      if (abs < bestAbs) {
        bestAbs = abs;
        bestKey = key;
      }
    }
    if (!bestKey) break;
    next[bestKey] += direction;
  }
  return next;
}

function allocateRemaining(
  remainingKcal: number,
  current: MacroGoals,
  freeKeys: MacroGramsKey[],
  dailyCalorieGoal: number,
): MacroGoals | { error: RebalanceFailureReason } {
  const next = cloneMacroGoals(current);
  if (freeKeys.length === 0) {
    return next;
  }

  if (remainingKcal < -ALIGNMENT_TOLERANCE_KCAL) {
    return { error: 'locked_exceed_target' };
  }

  if (remainingKcal <= ALIGNMENT_TOLERANCE_KCAL && remainingKcal >= -ALIGNMENT_TOLERANCE_KCAL) {
    // Residual is already within tolerance; keep free macros at 0 when the
    // remaining budget is ~0, otherwise leave them and nudge.
    if (Math.abs(remainingKcal) <= ALIGNMENT_TOLERANCE_KCAL && remainingKcal <= 0) {
      for (const key of freeKeys) next[key] = 0;
      return nudgeWholeGrams(next, freeKeys, dailyCalorieGoal);
    }
  }

  const weights = freeKeys.map((key) => Math.max(0, caloriesForGrams(key, current[key])));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightSum <= 0) {
    if (remainingKcal <= ALIGNMENT_TOLERANCE_KCAL) {
      for (const key of freeKeys) next[key] = 0;
      return nudgeWholeGrams(next, freeKeys, dailyCalorieGoal);
    }
    return { error: 'degenerate_ratio' };
  }

  if (remainingKcal <= 0) {
    for (const key of freeKeys) next[key] = 0;
    return nudgeWholeGrams(next, freeKeys, dailyCalorieGoal);
  }

  freeKeys.forEach((key, index) => {
    const energy = remainingKcal * (weights[index] / weightSum);
    const grams = roundToWholeGrams(energy / KCAL_PER_GRAM[key]);
    next[key] = grams;
  });

  if (freeKeys.some((key) => next[key] < 0)) {
    return { error: 'negative_grams' };
  }

  return nudgeWholeGrams(next, freeKeys, dailyCalorieGoal);
}

export function rebalanceMacros(input: {
  dailyCalorieGoal: number;
  macros: MacroGoals;
  locks?: MacroLocks;
  driver?: MacroGramsKey;
  intent?: RebalanceIntent;
}): RebalanceResult {
  const locks = input.locks ?? emptyMacroLocks();
  const intent = input.intent ?? 'balance';
  const current = cloneMacroGoals(input.macros);
  const { dailyCalorieGoal, driver } = input;

  if (MACRO_GRAM_KEYS.some((key) => !Number.isFinite(current[key]) || current[key] < 0)) {
    return fail('negative_grams', current);
  }

  const lockedOnlyKeys = MACRO_GRAM_KEYS.filter((key) => locks[GRAM_KEY_TO_LOCK[key]]);
  const lockCount = lockedOnlyKeys.length;

  if (lockedCaloriesExceedTarget(dailyCalorieGoal, current, locks)) {
    return fail('locked_exceed_target', current);
  }

  if (lockCount === 3) {
    const aligned = isCalorieMacroAligned(dailyCalorieGoal, current);
    if (aligned) {
      return { ok: true, macros: current, aligned: true, changed: false };
    }
    if (intent === 'balance') {
      return fail('three_locks_mismatch', current);
    }
    return { ok: true, macros: current, aligned: false, changed: false };
  }

  const fixedKeys = lockedGramKeys(locks, driver);
  const freeKeys = freeGramKeys(locks, driver);

  if (freeKeys.length === 0) {
    const aligned = isCalorieMacroAligned(dailyCalorieGoal, current);
    if (aligned) return { ok: true, macros: current, aligned: true, changed: false };
    return fail('no_valid_solution', current);
  }

  const fixedKcal = fixedKeys.reduce((sum, key) => sum + caloriesForGrams(key, current[key]), 0);
  const remainingKcal = dailyCalorieGoal - fixedKcal;

  const allocated = allocateRemaining(remainingKcal, current, freeKeys, dailyCalorieGoal);
  if ('error' in allocated) {
    return fail(allocated.error, current);
  }

  if (MACRO_GRAM_KEYS.some((key) => allocated[key] < 0)) {
    return fail('negative_grams', current);
  }

  const aligned = isCalorieMacroAligned(dailyCalorieGoal, allocated);
  if (!aligned) {
    return fail('no_valid_solution', current);
  }

  return {
    ok: true,
    macros: allocated,
    aligned: true,
    changed: !macrosEqual(current, allocated),
  };
}

export function applyGramEdit(input: {
  dailyCalorieGoal: number;
  macros: MacroGoals;
  locks?: MacroLocks;
  key: MacroGramsKey;
  grams: number;
}): RebalanceResult {
  const grams = roundToWholeGrams(input.grams);
  if (!Number.isFinite(grams) || grams < 0) {
    return fail('negative_grams', input.macros);
  }
  const macros = { ...cloneMacroGoals(input.macros), [input.key]: grams };
  return rebalanceMacros({
    dailyCalorieGoal: input.dailyCalorieGoal,
    macros,
    locks: input.locks,
    driver: input.key,
    intent: 'propagate',
  });
}

export function applyPercentEdit(input: {
  dailyCalorieGoal: number;
  macros: MacroGoals;
  locks?: MacroLocks;
  key: MacroGramsKey;
  percent: number;
}): RebalanceResult {
  const grams = roundToWholeGrams(
    gramsFromPercentage(input.dailyCalorieGoal, input.key, input.percent),
  );
  return applyGramEdit({
    dailyCalorieGoal: input.dailyCalorieGoal,
    macros: input.macros,
    locks: input.locks,
    key: input.key,
    grams,
  });
}

export function applyCalorieTargetChange(input: {
  dailyCalorieGoal: number;
  macros: MacroGoals;
  locks?: MacroLocks;
}): RebalanceResult {
  return rebalanceMacros({
    dailyCalorieGoal: input.dailyCalorieGoal,
    macros: input.macros,
    locks: input.locks,
    intent: 'propagate',
  });
}
