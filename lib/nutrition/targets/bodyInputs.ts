/**
 * Nutrition Targets v1 — derive estimator body inputs from the existing
 * canonical Profile fields (date_of_birth, sex, height_cm, weight_kg).
 *
 * Nutrition Targets v1 must reuse these inputs rather than ask for them
 * again (governing doc §1). This module never writes profile fields; it
 * only reads/normalizes what Initial Setup already captured.
 */

import type { NutritionTargetsBodyInputs, NutritionTargetsSex } from './estimate';

/**
 * Mirrors the local (non-exported) `deriveAgeYears` in
 * lib/plans/planServerService.ts. Re-declared here rather than imported to
 * keep lib/nutrition free of a dependency on lib/plans server internals —
 * same duplication convention already used elsewhere in this codebase
 * (see lib/journal/types.ts `payloadHasMealGroup` comment).
 */
export function deriveAgeYears(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    years--;
  }
  return years;
}

export function normalizeSexForEstimate(value: unknown): NutritionTargetsSex | null {
  if (value === 'male' || value === 'female') return value;
  if (typeof value === 'string' && value.trim().length > 0) return 'unspecified';
  return null;
}

export interface ProfileBodyFields {
  date_of_birth?: string | null;
  sex?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
}

export function extractBodyInputsFromProfile(
  profile: ProfileBodyFields,
  now: Date = new Date(),
): NutritionTargetsBodyInputs {
  return {
    age_years: deriveAgeYears(profile.date_of_birth ?? null, now),
    sex: normalizeSexForEstimate(profile.sex ?? null),
    height_cm: typeof profile.height_cm === 'number' ? profile.height_cm : null,
    weight_kg: typeof profile.weight_kg === 'number' ? profile.weight_kg : null,
  };
}
