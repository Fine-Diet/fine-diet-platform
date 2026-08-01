/**
 * Package 5A — deterministic component-expansion contract for Package 5B.
 *
 * Does NOT generate grocery lists. Preserves provenance IDs at every edge so
 * 5B can resolve:
 *   Meal portion → direct food/product demand
 *                → recipe portion → recipe ingredient requirements → foods
 */

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
  provenance: GroceryDemandProvenanceContract;
}

export interface ExpandMealCompositionOptions {
  /** Optional recipe loader for one-level ingredient expansion. */
  resolveRecipe?: (recipeMealDocumentId: string) => MealDocument | null | undefined;
  plan_id?: string | null;
  plan_day_id?: string | null;
  planned_meal_id?: string | null;
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
  if (recipeId && resolveRecipe) {
    const recipe = resolveRecipe(recipeId);
    if (recipe) {
      for (const ingredient of recipe.components ?? []) {
        children.push({
          kind:
            ingredient.component_kind === 'recipe_document'
              ? 'recipe_portion'
              : ingredient.food_object_id
                ? 'recipe_ingredient'
                : 'unresolved',
          component_id: ingredient.component_id,
          component_kind: ingredient.component_kind,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          food_object_id: ingredient.food_object_id,
          recipe_meal_document_id: ingredient.recipe_meal_document_id,
          recipe_version_token: ingredient.recipe_version_token,
          provenance: {
            ...nodeProvenance,
            recipe_component_id: ingredient.component_id,
            food_object_id: ingredient.food_object_id,
            component_kind: ingredient.component_kind ?? null,
          },
        });
      }
    }
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
    provenance: nodeProvenance,
  };
}

/**
 * Expand a MealDocument into a provenance-preserving composition tree.
 * Recipe ingredients are expanded only when `resolveRecipe` is supplied.
 */
export function expandMealComposition(
  doc: MealDocument,
  options?: ExpandMealCompositionOptions,
): MealCompositionExpansionNode {
  const provenance = baseProvenance(doc, options);
  const children = (doc.components ?? []).map((component) => {
    if (component.component_kind === 'recipe_document' || component.recipe_meal_document_id) {
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
