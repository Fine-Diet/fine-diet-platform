/**
 * Package 5A — build and validate first-class recipe-reference MealComponents.
 */

import type {
  CanonicalMacros,
  MealComponent,
  MealComponentDisplaySnapshot,
  MealComponentNutritionSnapshot,
  MealDocument,
  MealNutrition,
} from './types';
import { DEFAULT_MEAL_DOCUMENT_VERSION } from './types';
import { isMealDocumentArchived } from './lifecycle';

function emptyMacros(): CanonicalMacros {
  return { protein_g: null, carbs_g: null, fat_g: null };
}

function hasNutritionValues(n: MealNutrition | null | undefined): n is MealNutrition {
  if (!n) return false;
  const m = n.macros;
  return (
    n.calories != null ||
    m.protein_g != null ||
    m.carbs_g != null ||
    m.fat_g != null ||
    m.fiber_g != null ||
    m.added_sugar_g != null
  );
}

export function resolveMealDocumentVersionToken(
  doc: Pick<MealDocument, 'document_version' | 'updated_at' | 'id'>,
): string {
  if (
    typeof doc.document_version === 'number' &&
    Number.isFinite(doc.document_version) &&
    doc.document_version >= 1
  ) {
    return `v${doc.document_version}`;
  }
  if (typeof doc.updated_at === 'string' && doc.updated_at.trim().length > 0) {
    return `updated_at:${doc.updated_at.trim()}`;
  }
  if (typeof doc.id === 'string' && doc.id.trim().length > 0) {
    return `id:${doc.id.trim()}`;
  }
  return 'unknown';
}

export function nextMealDocumentVersion(
  current: Pick<MealDocument, 'document_version'> | null | undefined,
): number {
  const base =
    typeof current?.document_version === 'number' &&
    Number.isFinite(current.document_version) &&
    current.document_version >= 1
      ? current.document_version
      : DEFAULT_MEAL_DOCUMENT_VERSION;
  return base + 1;
}

export function captureRecipeDisplaySnapshot(
  recipe: MealDocument,
): MealComponentDisplaySnapshot {
  return {
    title: recipe.title,
    serving_label: recipe.serving_label,
    yield_servings: recipe.recipe_yield_servings ?? recipe.yield?.servings ?? null,
    kind: recipe.kind,
  };
}

export function captureRecipeNutritionSnapshot(
  recipe: MealDocument,
): MealComponentNutritionSnapshot {
  const perServing = recipe.per_serving;
  const status = recipe.nutrition_status ?? null;
  if (hasNutritionValues(perServing)) {
    const estimated =
      status === 'imported' || status === 'user_entered' || status === 'unknown';
    return {
      per_serving: {
        calories: perServing.calories,
        macros: { ...perServing.macros },
      },
      nutrition_status: status,
      status: estimated ? 'estimated' : 'available',
    };
  }
  return {
    per_serving: null,
    nutrition_status: status ?? 'unavailable',
    status: 'unavailable',
  };
}

export type RecipeAttachErrorCode =
  | 'not_a_recipe'
  | 'missing_recipe_id'
  | 'archived_recipe'
  | 'self_reference'
  | 'circular_reference';

export class RecipeAttachError extends Error {
  readonly code: RecipeAttachErrorCode;
  constructor(code: RecipeAttachErrorCode, message: string) {
    super(message);
    this.name = 'RecipeAttachError';
    this.code = code;
    Object.setPrototypeOf(this, RecipeAttachError.prototype);
  }
}

/**
 * Future cycle guard: reject attaching a recipe that already contains (directly
 * or via typed components) a reference back to the host document.
 */
export function assertNoRecipeCycle(
  hostDocumentId: string | null | undefined,
  recipe: MealDocument,
): void {
  if (!hostDocumentId) return;
  if (recipe.id === hostDocumentId) {
    throw new RecipeAttachError(
      'self_reference',
      'A meal cannot reference itself as a recipe component',
    );
  }
  for (const component of recipe.components ?? []) {
    if (
      component.component_kind === 'recipe_document' &&
      component.recipe_meal_document_id === hostDocumentId
    ) {
      throw new RecipeAttachError(
        'circular_reference',
        'Circular recipe references are not allowed',
      );
    }
  }
}

export function assertRecipeAttachable(
  recipe: MealDocument,
  options?: { hostDocumentId?: string | null },
): void {
  if (!recipe.id) {
    throw new RecipeAttachError('missing_recipe_id', 'Recipe must be saved before it can be attached');
  }
  if (recipe.kind !== 'recipe') {
    throw new RecipeAttachError('not_a_recipe', 'Only saved Recipes can be attached as components');
  }
  if (isMealDocumentArchived(recipe)) {
    throw new RecipeAttachError(
      'archived_recipe',
      'Archived recipes remain readable but cannot be newly attached',
    );
  }
  assertNoRecipeCycle(options?.hostDocumentId, recipe);
}

export function buildRecipeReferenceComponent(args: {
  componentId: string;
  recipe: MealDocument;
  quantity?: number | null;
  unit?: string | null;
  hostDocumentId?: string | null;
}): MealComponent {
  const { componentId, recipe, hostDocumentId } = args;
  assertRecipeAttachable(recipe, { hostDocumentId });

  const quantity =
    typeof args.quantity === 'number' && Number.isFinite(args.quantity) && args.quantity > 0
      ? args.quantity
      : 1;
  const unit = (args.unit ?? recipe.serving_label ?? 'serving').trim() || 'serving';
  const display = captureRecipeDisplaySnapshot(recipe);
  const nutrition = captureRecipeNutritionSnapshot(recipe);
  const available = nutrition.status !== 'unavailable' && hasNutritionValues(nutrition.per_serving);

  return {
    component_id: componentId,
    component_kind: 'recipe_document',
    name: display.title,
    quantity,
    unit,
    food_object_id: null,
    recipe_meal_document_id: recipe.id,
    recipe_version_token: resolveMealDocumentVersionToken(recipe),
    display_snapshot: display,
    nutrition_snapshot: nutrition,
    calories: available ? nutrition.per_serving!.calories : null,
    macros: available
      ? { ...nutrition.per_serving!.macros }
      : emptyMacros(),
    nutrition_basis: 'per_serving',
    match_status: available ? 'matched' : 'none',
    // Provenance: snapshot-derived nutrition without a food_object link.
    source_kind: 'user_entered',
    needs_review: !available,
  };
}
