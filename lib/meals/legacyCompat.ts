/**
 * Package 3 — Honest legacy shape compatibility.
 *
 * Adapters that cannot map a legacy shape without inventing required fields
 * return a discriminated failure instead of silently coercing misleading data.
 * Successful paths still use lib/meals/adapters.ts.
 */

import type { CanonicalMacros } from './types';

export type LegacyCompatResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; code: LegacyCompatErrorCode; errors: string[] };

export type LegacyCompatErrorCode =
  | 'incompatible_shape'
  | 'missing_required_fields'
  | 'ambiguous_nutrition'
  | 'unknown_kind';

/**
 * Convert canonical macros to plans/eat-out snake totals WITHOUT zero-filling
 * nulls. Prefer this over macrosToSnakeTotals when honesty matters; the legacy
 * helper remains for attachable payloads that historically required numbers.
 */
export function macrosToSnakeNullable(macros: CanonicalMacros): {
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g?: number | null;
  added_sugar_g?: number | null;
} {
  const out: {
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g?: number | null;
    added_sugar_g?: number | null;
  } = {
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
  };
  if (macros.fiber_g !== undefined) out.fiber_g = macros.fiber_g;
  if (macros.added_sugar_g !== undefined) out.added_sugar_g = macros.added_sugar_g;
  return out;
}

/**
 * Probe an unknown blob for whether it looks like a MealDocument-compatible
 * object. Does not coerce; returns failure with reasons when incompatible.
 */
export function probeLegacyMealShape(input: unknown): LegacyCompatResult<{
  shape:
    | 'meal_document'
    | 'meal_template'
    | 'imported_meal'
    | 'planned_meal_payload'
    | 'unknown';
}> {
  if (input == null || typeof input !== 'object') {
    return {
      ok: false,
      code: 'incompatible_shape',
      errors: ['value is not an object'],
    };
  }

  const obj = input as Record<string, unknown>;
  const warnings: string[] = [];

  if (
    typeof obj.schema_version === 'number' &&
    (obj.kind === 'meal' || obj.kind === 'recipe') &&
    Array.isArray(obj.components)
  ) {
    return { ok: true, value: { shape: 'meal_document' }, warnings };
  }

  if (typeof obj.name === 'string' && Array.isArray(obj.items) && obj.id != null) {
    // journal_meal_templates-like
    if (obj.items.length > 0) {
      const first = obj.items[0] as Record<string, unknown>;
      if (first && ('foodObjectId' in first || 'macros' in first)) {
        return { ok: true, value: { shape: 'meal_template' }, warnings };
      }
    }
    return { ok: true, value: { shape: 'meal_template' }, warnings };
  }

  if (
    obj.parsed_payload_json != null ||
    obj.import_type != null ||
    (obj.source_type != null && obj.parse_status != null)
  ) {
    return { ok: true, value: { shape: 'imported_meal' }, warnings };
  }

  if (Array.isArray(obj.items) && obj.totals != null && typeof obj.totals === 'object') {
    warnings.push('planned_meal_payload_heuristic');
    return { ok: true, value: { shape: 'planned_meal_payload' }, warnings };
  }

  return {
    ok: false,
    code: 'incompatible_shape',
    errors: [
      'unrecognized legacy meal/recipe shape; refusing silent coercion',
      `keys=${Object.keys(obj).slice(0, 12).join(',')}`,
    ],
  };
}
