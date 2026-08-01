/**
 * Package 5A — shared MealComponent contract normalizer.
 *
 * Used at database hydration, API response hydration, composer initialization,
 * persist validation, and planning-source reads. Infers missing component_kind
 * conservatively; never invents recipe references from display text.
 */

import type {
  MealComponent,
  MealComponentKind,
  MealDocument,
} from './types';
import { normalizeLegacyMealComponentEnums } from './normalizeLegacyMealComponentEnums';

const CANONICAL_COMPONENT_KINDS = new Set<MealComponentKind>([
  'food_concept',
  'product_variant',
  'recipe_document',
  'user_entered',
  'prepared_batch',
]);

function isCanonicalComponentKind(value: unknown): value is MealComponentKind {
  return typeof value === 'string' && CANONICAL_COMPONENT_KINDS.has(value as MealComponentKind);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Infer component_kind for legacy rows. Never infer recipe_document from name.
 */
export function inferMealComponentKind(component: {
  component_kind?: unknown;
  recipe_meal_document_id?: unknown;
  food_object_id?: unknown;
}): MealComponentKind {
  if (isCanonicalComponentKind(component.component_kind)) {
    return component.component_kind;
  }
  if (hasNonEmptyString(component.recipe_meal_document_id)) {
    return 'recipe_document';
  }
  if (hasNonEmptyString(component.food_object_id)) {
    // Without food_objects.sourceType at this boundary, prefer food_concept.
    // Composer sets product_variant explicitly for branded foods.
    return 'food_concept';
  }
  return 'user_entered';
}

export function normalizeMealComponentContract<T extends object>(component: T): T {
  const afterEnums = normalizeLegacyMealComponentEnums(component);
  const record = afterEnums as T & {
    component_kind?: unknown;
    recipe_meal_document_id?: unknown;
    food_object_id?: unknown;
  };
  const nextKind = inferMealComponentKind(record);
  if (record.component_kind === nextKind) return afterEnums;
  return {
    ...record,
    component_kind: nextKind,
  };
}

export function normalizeMealDocumentComponentContract(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const doc = input as Record<string, unknown>;
  if (!Array.isArray(doc.components)) return input;

  let changed = false;
  const components = doc.components.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const normalized = normalizeMealComponentContract(entry);
    if (normalized !== entry) changed = true;
    return normalized;
  });

  const documentVersion =
    typeof doc.document_version === 'number' &&
    Number.isFinite(doc.document_version) &&
    doc.document_version >= 1
      ? doc.document_version
      : 1;
  if (doc.document_version !== documentVersion) changed = true;

  if (!changed) return input;
  return { ...doc, document_version: documentVersion, components };
}

export function normalizeMealDocumentContract(doc: MealDocument): MealDocument {
  return normalizeMealDocumentComponentContract(doc) as MealDocument;
}

/** Map food_objects.sourceType → component_kind for direct food portions. */
export function componentKindFromFoodSourceType(
  sourceType: string | null | undefined,
): Extract<MealComponentKind, 'food_concept' | 'product_variant'> {
  if (sourceType === 'branded') return 'product_variant';
  return 'food_concept';
}
