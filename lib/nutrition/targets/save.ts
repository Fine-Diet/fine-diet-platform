/**
 * Nutrition Targets v1 — canonical save.
 *
 * Persists into the EXISTING goals contract (`/api/journal/goals` →
 * people.metadata.dailyCalorieGoal / macroGoals) plus a provenance record
 * in the same metadata namespace. Never writes a second/competing target
 * store. Activity baseline (if newly confirmed) is written through the
 * existing Profile endpoint since `activity_baseline` is already a
 * canonical profile field.
 */

import type { MacroGoals, NutritionTargetProvenance, NutritionTargetSource } from '@/lib/journal/types';
import type { NutritionTargetsActivityBaseline } from './estimate';

export interface NutritionTargetsSaveInput {
  dailyCalorieGoal: number;
  /**
   * Nutrition Targets v1 §7 macros are optional, and review item
   * "clear_existing_macros" requires three distinct states here:
   *  - omit this field entirely (`undefined`): this save doesn't concern
   *    macros at all — leave whatever macroGoals is already stored
   *    untouched (e.g. a calorie-only "Looks Good" confirmation).
   *  - `null`: an explicit clear — forwarded to the goals endpoint so an
   *    already-stored macroGoals is actually removed, not silently kept.
   *  - a `MacroGoals` object: set macros to exactly those values.
   */
  macroGoals?: MacroGoals | null;
  source: NutritionTargetSource;
  estimatedCalories: number | null;
  modelVersion: string | null;
  activityBaseline: string | null;
  bodyInputsUsedAt: NutritionTargetProvenance['bodyInputsUsedAt'];
  /** Set only when the user newly confirmed an activity level this session (profile.activity_baseline was previously unset). */
  activityBaselineToPersist?: NutritionTargetsActivityBaseline | null;
}

/**
 * Resolve the three raw macro input strings (from the editor) into either a
 * fully-specified MacroGoals object or `null` for "unset" — never a
 * partially-filled object with synthesized zeros.
 *
 * Review item "macro_optional_semantics": the canonical `macroGoals`
 * persistence field is all-or-none (three required numbers), so macros are
 * treated as a single optional trio. Filling in some but not all three is
 * rejected as an incomplete entry rather than silently coerced — leaving a
 * field blank must never be interpreted as "this macro is 0g", and macro
 * values are never derived from the calorie target.
 */
export function resolveOptionalMacroInputs(
  macros: { protein_g: string; carbs_g: string; fat_g: string },
): { ok: true; macroGoals: MacroGoals | null } | { ok: false; error: string } {
  const entries: [keyof MacroGoals, string][] = [
    ['protein_g', macros.protein_g],
    ['carbs_g', macros.carbs_g],
    ['fat_g', macros.fat_g],
  ];
  const filled = entries.filter(([, v]) => v.trim() !== '');

  if (filled.length === 0) {
    return { ok: true, macroGoals: null };
  }

  if (filled.length < entries.length) {
    return { ok: false, error: 'Enter all three macros (protein, carbs, fat), or leave all three blank to skip macros.' };
  }

  const parsed: Partial<MacroGoals> = {};
  for (const [key, raw] of entries) {
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      return { ok: false, error: 'Macro targets must be zero or a positive number.' };
    }
    parsed[key] = num;
  }

  return { ok: true, macroGoals: parsed as MacroGoals };
}

export function validateNutritionTargetsSave(
  input: Pick<NutritionTargetsSaveInput, 'dailyCalorieGoal' | 'macroGoals'>,
): { ok: true } | { ok: false; error: string } {
  if (
    !Number.isFinite(input.dailyCalorieGoal) ||
    input.dailyCalorieGoal < 500 ||
    input.dailyCalorieGoal > 10000
  ) {
    return { ok: false, error: 'Enter a calorie target between 500 and 10,000.' };
  }
  if (input.macroGoals) {
    for (const value of Object.values(input.macroGoals)) {
      if (!Number.isFinite(value) || value < 0) {
        return { ok: false, error: 'Macro targets must be zero or a positive number.' };
      }
    }
  }
  return { ok: true };
}

export async function saveNutritionTargets(
  input: NutritionTargetsSaveInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validateNutritionTargetsSave(input);
  if (!validated.ok) return validated;

  try {
    if (input.activityBaselineToPersist) {
      const profileRes = await fetch('/api/journal/profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_baseline: input.activityBaselineToPersist }),
      });
      if (!profileRes.ok) {
        return { ok: false, error: 'Could not save your activity level. Try again.' };
      }
    }

    const provenance: NutritionTargetProvenance = {
      source: input.source,
      estimatedCalories: input.estimatedCalories,
      modelVersion: input.modelVersion,
      activityBaseline: input.activityBaseline,
      bodyInputsUsedAt: input.bodyInputsUsedAt,
      confirmedAt: new Date().toISOString(),
    };

    const body: Record<string, unknown> = {
      dailyCalorieGoal: input.dailyCalorieGoal,
      provenance,
    };
    // `undefined` → omit (leave untouched); `null` → explicit clear;
    // object → set. See NutritionTargetsSaveInput.macroGoals doc comment.
    if (input.macroGoals !== undefined) body.macroGoals = input.macroGoals;

    const goalsRes = await fetch('/api/journal/goals', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!goalsRes.ok) {
      return { ok: false, error: 'Could not save your nutrition targets. Try again.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save your nutrition targets. Try again.' };
  }
}
