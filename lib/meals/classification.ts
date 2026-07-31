/**
 * Package 3 — Meal vs Recipe classification helpers.
 *
 * Frozen ownership:
 *   - Recipe = preparation (ingredients, quantities, steps, yield, provenance)
 *   - Meal   = reusable eating choice/composition (may reference components)
 *
 * Kind is stored on MealDocument.kind. These helpers surface inconsistencies
 * honestly instead of silently rewriting kind.
 */

import type { MealDocument, MealDocumentKind } from './types';

export interface MealKindClassification {
  kind: MealDocumentKind;
  /** True when stored kind matches structural signals. */
  consistent: boolean;
  /** Human-readable reasons when inconsistent or when kind was inferred. */
  reasons: string[];
  /** Structural suggestion when the stored kind looks wrong; null if consistent. */
  suggested_kind: MealDocumentKind | null;
}

function hasPrepSteps(doc: Pick<MealDocument, 'steps'>): boolean {
  return Array.isArray(doc.steps) && doc.steps.some((s) => s.instruction?.trim());
}

function hasYield(doc: Pick<MealDocument, 'yield' | 'recipe_yield_servings'>): boolean {
  if (doc.yield != null && (doc.yield.servings != null || doc.yield.confirmed)) {
    return true;
  }
  return doc.recipe_yield_servings != null;
}

/**
 * Infer the structural kind from preparation signals without mutating the document.
 * Recipes typically carry prep steps and/or a yield definition.
 */
export function inferMealDocumentKind(
  doc: Pick<MealDocument, 'steps' | 'yield' | 'recipe_yield_servings' | 'kind'>,
): MealDocumentKind {
  if (hasPrepSteps(doc) || hasYield(doc)) return 'recipe';
  return 'meal';
}

/**
 * Classify a document's kind against structural signals. Never rewrites kind;
 * surfaces inconsistency for review / founder decision.
 */
export function classifyMealDocumentKind(doc: MealDocument): MealKindClassification {
  const inferred = inferMealDocumentKind(doc);
  const reasons: string[] = [];

  if (hasPrepSteps(doc)) reasons.push('has_prep_steps');
  if (hasYield(doc)) reasons.push('has_yield');
  if (!hasPrepSteps(doc) && !hasYield(doc)) reasons.push('assembled_components_only');

  if (doc.kind === inferred) {
    return { kind: doc.kind, consistent: true, reasons, suggested_kind: null };
  }

  reasons.push(`stored_kind=${doc.kind}`, `inferred_kind=${inferred}`);
  return {
    kind: doc.kind,
    consistent: false,
    reasons,
    suggested_kind: inferred,
  };
}

/**
 * Validate that a create/edit payload's kind is one of the allowed values.
 * Fail-closed: unknown strings are rejected.
 */
export function assertMealDocumentKind(value: unknown): MealDocumentKind {
  if (value === 'meal' || value === 'recipe') return value;
  throw new Error(`Invalid meal document kind: ${String(value)}`);
}
