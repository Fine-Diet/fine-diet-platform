/**
 * Package 5A/5B — deterministic component-expansion contract.
 *
 * Preserves provenance IDs at every edge so grocery demand can resolve:
 *   Meal portion → direct food/product demand
 *                → recipe portion → recipe ingredient requirements → foods
 *
 * Package 5B scaling policy (explicit):
 *   ingredient_demand_qty = ingredient_qty × (meal_recipe_portion_qty / recipe_yield)
 * Yield basis: confirmed yield.servings, else positive recipe_yield_servings,
 * else 1 when the recipe has no yield concept. When portion or yield is unsafe,
 * child quantities become null and `notes` carries an explicit review reason.
 *
 * Nested recipe boundary (Package 5B):
 *   Expansion is one-level only. A recipe ingredient that is itself a
 *   recipe_document is stamped as a structural nested `recipe_portion` child
 *   with an explicit deferred note — never recursively expanded here.
 *   Callers must not invent nested demand by display name.
 *
 * Does NOT mutate MealDocuments or Recipes. Does NOT generate grocery lists.
 */

import { ROUNDING_DECIMALS } from './recompute';
import type {
  GroceryDemandProvenanceContract,
  MealComponent,
  MealComponentKind,
  MealDocument,
} from './types';
import { resolveMealDocumentVersionToken } from './recipeComponent';

export type MealCompositionExpansionNodeKind =
  | 'meal_document'
  | 'direct_component'
  | 'recipe_portion'
  | 'recipe_ingredient'
  | 'unresolved';

export interface MealCompositionExpansionNode {
  kind: MealCompositionExpansionNodeKind;
  component_id?: string;
  component_kind?: MealComponentKind;
  name: string;
  quantity: number | null;
  unit: string | null;
  food_object_id?: string | null;
  recipe_meal_document_id?: string | null;
  recipe_version_token?: string | null;
  children?: MealCompositionExpansionNode[];
  /** Soft-fail / boundary notes for demand flatteners (never invents qty). */
  notes?: string | null;
  provenance: GroceryDemandProvenanceContract;
}

export interface ExpandMealCompositionOptions {
  /** Optional recipe loader for one-level ingredient expansion. */
  resolveRecipe?: (recipeMealDocumentId: string) => MealDocument | null | undefined;
  plan_id?: string | null;
  plan_day_id?: string | null;
  planned_meal_id?: string | null;
}

export const NESTED_RECIPE_BOUNDARY_NOTE =
  'nested recipe expansion deferred (cycle-safe one-level boundary)';

export const RECIPE_SCALING_UNSAFE_NOTE =
  'recipe portion/yield scaling unsafe — quantity needs review';

export const RECIPE_UNAVAILABLE_NOTE =
  'referenced recipe unavailable for ingredient expansion';

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundQuantity(value: number, decimals: number = ROUNDING_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Confirmed recipe yield for grocery demand scaling.
 * - confirmed positive yield.servings
 * - else positive recipe_yield_servings mirror
 * - else 1 when no yield concept exists (single-serving batch)
 * - else null (unsafe — do not invent)
 */
export function resolveGroceryRecipeYield(
  recipe: Pick<MealDocument, 'yield' | 'recipe_yield_servings'>,
): number | null {
  if (recipe.yield != null) {
    if (recipe.yield.confirmed && isPositiveNumber(recipe.yield.servings)) {
      return recipe.yield.servings;
    }
    if (isPositiveNumber(recipe.recipe_yield_servings)) {
      return recipe.recipe_yield_servings;
    }
    return null;
  }
  if (isPositiveNumber(recipe.recipe_yield_servings)) {
    return recipe.recipe_yield_servings;
  }
  return 1;
}

/**
 * Scale one recipe-ingredient quantity by meal portion / recipe yield.
 * Returns null quantity + note when scaling is unsafe.
 */
export function scaleRecipeIngredientQuantity(
  ingredientQuantity: number | null,
  portionQuantity: number | null,
  recipe: Pick<MealDocument, 'yield' | 'recipe_yield_servings'>,
): { quantity: number | null; note: string | null } {
  const yieldServings = resolveGroceryRecipeYield(recipe);
  if (!isPositiveNumber(portionQuantity) || !isPositiveNumber(yieldServings)) {
    return { quantity: null, note: RECIPE_SCALING_UNSAFE_NOTE };
  }
  if (ingredientQuantity == null) {
    return { quantity: null, note: null };
  }
  const factor = portionQuantity / yieldServings;
  return { quantity: roundQuantity(ingredientQuantity * factor), note: null };
}

function baseProvenance(
  doc: MealDocument,
  options?: ExpandMealCompositionOptions,
): GroceryDemandProvenanceContract {
  return {
    plan_id: options?.plan_id ?? null,
    plan_day_id: options?.plan_day_id ?? null,
    planned_meal_id: options?.planned_meal_id ?? null,
    source_meal_document_id: doc.id,
    source_meal_document_version_token: resolveMealDocumentVersionToken(doc),
  };
}

function expandDirect(component: MealComponent, provenance: GroceryDemandProvenanceContract): MealCompositionExpansionNode {
  const kind: MealCompositionExpansionNodeKind =
    component.component_kind === 'user_entered' || !component.food_object_id
      ? 'unresolved'
      : 'direct_component';
  return {
    kind,
    component_id: component.component_id,
    component_kind: component.component_kind,
    name: component.name,
    quantity: component.quantity,
    unit: component.unit,
    food_object_id: component.food_object_id,
    provenance: {
      ...provenance,
      meal_component_id: component.component_id,
      food_object_id: component.food_object_id,
      component_kind: component.component_kind ?? null,
    },
  };
}

function isRecipeReference(component: MealComponent): boolean {
  return component.component_kind === 'recipe_document' || !!component.recipe_meal_document_id;
}

function expandRecipePortion(
  component: MealComponent,
  provenance: GroceryDemandProvenanceContract,
  resolveRecipe?: ExpandMealCompositionOptions['resolveRecipe'],
): MealCompositionExpansionNode {
  const recipeId = component.recipe_meal_document_id ?? null;
  const recipeVersion = component.recipe_version_token ?? null;
  const nodeProvenance: GroceryDemandProvenanceContract = {
    ...provenance,
    meal_component_id: component.component_id,
    recipe_meal_document_id: recipeId,
    recipe_version_token: recipeVersion,
    component_kind: 'recipe_document',
  };

  const children: MealCompositionExpansionNode[] = [];
  let portionNotes: string | null = null;

  if (recipeId && resolveRecipe) {
    const recipe = resolveRecipe(recipeId);
    if (recipe) {
      for (const ingredient of recipe.components ?? []) {
        const nested = isRecipeReference(ingredient);
        const scaled = scaleRecipeIngredientQuantity(
          ingredient.quantity,
          component.quantity,
          recipe,
        );
        let notes: string | null = scaled.note;
        if (nested) {
          notes = notes
            ? `${NESTED_RECIPE_BOUNDARY_NOTE}; ${notes}`
            : NESTED_RECIPE_BOUNDARY_NOTE;
        }
        children.push({
          kind: nested
            ? 'recipe_portion'
            : ingredient.food_object_id
              ? 'recipe_ingredient'
              : 'unresolved',
          component_id: ingredient.component_id,
          component_kind: ingredient.component_kind,
          name: ingredient.name,
          quantity: scaled.quantity,
          unit: ingredient.unit,
          food_object_id: ingredient.food_object_id,
          recipe_meal_document_id: ingredient.recipe_meal_document_id,
          recipe_version_token: ingredient.recipe_version_token,
          notes,
          provenance: {
            ...nodeProvenance,
            recipe_component_id: ingredient.component_id,
            food_object_id: ingredient.food_object_id,
            component_kind: ingredient.component_kind ?? null,
          },
        });
      }
    } else {
      portionNotes = RECIPE_UNAVAILABLE_NOTE;
    }
  } else if (recipeId && !resolveRecipe) {
    portionNotes = RECIPE_UNAVAILABLE_NOTE;
  }

  return {
    kind: 'recipe_portion',
    component_id: component.component_id,
    component_kind: 'recipe_document',
    name: component.display_snapshot?.title ?? component.name,
    quantity: component.quantity,
    unit: component.unit,
    recipe_meal_document_id: recipeId,
    recipe_version_token: recipeVersion,
    children: children.length > 0 ? children : undefined,
    notes: portionNotes,
    provenance: nodeProvenance,
  };
}

/**
 * Expand a MealDocument into a provenance-preserving composition tree.
 * Recipe ingredients are expanded only when `resolveRecipe` is supplied.
 * Nested recipe references are not recursively expanded (one-level boundary).
 */
export function expandMealComposition(
  doc: MealDocument,
  options?: ExpandMealCompositionOptions,
): MealCompositionExpansionNode {
  const provenance = baseProvenance(doc, options);
  const children = (doc.components ?? []).map((component) => {
    if (isRecipeReference(component)) {
      return expandRecipePortion(component, provenance, options?.resolveRecipe);
    }
    return expandDirect(component, provenance);
  });

  return {
    kind: 'meal_document',
    name: doc.title,
    quantity: 1,
    unit: 'meal',
    children,
    provenance,
  };
}
