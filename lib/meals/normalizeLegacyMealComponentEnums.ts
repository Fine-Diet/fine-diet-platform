/**
 * Canonical normalization for legacy/partially populated MealComponent enums.
 *
 * Recovered or older document_json rows may carry unsupported values such as
 * source_kind "unmatched" or null nutrition_basis. Those fail the current
 * MealDocumentSchema. Normalize only the unsupported/missing enum fields at
 * the read and persist boundaries — never widen the canonical schema.
 */

import type { MealComponent, MealDocument } from './types';

const CANONICAL_SOURCE_KINDS = new Set([
  'food_object',
  'heuristic_guess',
  'default_guess',
  'user_entered',
] as const);

const CANONICAL_NUTRITION_BASES = new Set(['per_component', 'per_serving'] as const);

type CanonicalSourceKind = MealComponent['source_kind'];
type CanonicalNutritionBasis = MealComponent['nutrition_basis'];

function isCanonicalSourceKind(value: unknown): value is CanonicalSourceKind {
  return typeof value === 'string' && CANONICAL_SOURCE_KINDS.has(value as CanonicalSourceKind);
}

function isCanonicalNutritionBasis(value: unknown): value is CanonicalNutritionBasis {
  return (
    typeof value === 'string' &&
    CANONICAL_NUTRITION_BASES.has(value as CanonicalNutritionBasis)
  );
}

/**
 * Normalize one component's unsupported/missing enum values.
 * All other fields are preserved by shallow clone only when a change is needed.
 */
export function normalizeLegacyMealComponentEnums<T extends object>(component: T): T {
  const record = component as T & {
    source_kind?: unknown;
    nutrition_basis?: unknown;
  };
  const nextSourceKind = isCanonicalSourceKind(record.source_kind)
    ? record.source_kind
    : 'user_entered';
  const nextNutritionBasis = isCanonicalNutritionBasis(record.nutrition_basis)
    ? record.nutrition_basis
    : 'per_component';

  if (
    nextSourceKind === record.source_kind &&
    nextNutritionBasis === record.nutrition_basis
  ) {
    return component;
  }

  return {
    ...record,
    source_kind: nextSourceKind,
    nutrition_basis: nextNutritionBasis,
  };
}

/**
 * Apply component enum normalization across a MealDocument-shaped value.
 * Safe on unknown input: non-objects / missing components pass through.
 */
export function normalizeMealDocumentLegacyComponentEnums(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const doc = input as Record<string, unknown>;
  if (!Array.isArray(doc.components)) return input;

  let changed = false;
  const components = doc.components.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const normalized = normalizeLegacyMealComponentEnums(entry);
    if (normalized !== entry) changed = true;
    return normalized;
  });

  if (!changed) return input;
  return { ...doc, components };
}

/** Typed convenience for already-shaped MealDocument values. */
export function normalizeMealDocumentComponentEnums(doc: MealDocument): MealDocument {
  return normalizeMealDocumentLegacyComponentEnums(doc) as MealDocument;
}
