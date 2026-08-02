/**
 * Package 5B — typed plan → grocery demand expansion bridge.
 *
 * Hydrates planned meals via plannedMealToMealDocument (typed_components
 * preferred, items[] fallback), expands with expandMealComposition + a
 * person-scoped resolveRecipe loader, then flattens only demand leaves.
 *
 * recipe_portion nodes are structural (not buy lines) unless they could not
 * be expanded — then they become honest unresolved demand.
 *
 * Pure flatten helpers are sync/testable. Recipe loading is async and
 * person-scoped via getMealDocumentForPerson (archived reads allowed).
 */

import { plannedMealToMealDocument } from '@/lib/meals/adapters';
import {
  expandMealComposition,
  NESTED_RECIPE_BOUNDARY_NOTE,
  type MealCompositionExpansionNode,
} from '@/lib/meals/componentExpansion';
import { getMealDocumentForPerson } from '@/lib/meals/mealDocumentServerService';
import type { GroceryDemandProvenanceContract, MealDocument } from '@/lib/meals/types';
import type { PlannedMeal } from './types';

export interface GroceryDemandContributor {
  planned_meal_id: string;
  meal_name: string | null;
  via_recipe_name: string | null;
  provenance: GroceryDemandProvenanceContract;
}

export interface GroceryDemandCandidate {
  name: string;
  quantity: number | null;
  unit: string | null;
  food_object_id: string | null;
  planned_meal_id: string;
  notes: string | null;
  contributor: GroceryDemandContributor;
}

function appendNote(current: string | null | undefined, note: string | null | undefined): string | null {
  if (!note) return current ?? null;
  if (!current) return note;
  if (current.includes(note)) return current;
  return `${current}; ${note}`;
}

function contributorLabel(mealName: string | null, viaRecipe: string | null): string {
  if (viaRecipe && mealName) return `via ${viaRecipe} (${mealName})`;
  if (viaRecipe) return `via ${viaRecipe}`;
  if (mealName) return mealName;
  return 'planned meal';
}

/**
 * Flatten an expansion tree into grocery demand leaves.
 * - Emits: direct_component, recipe_ingredient, unresolved
 * - recipe_portion with children: recurse only (structural)
 * - recipe_portion without children / nested boundary: unresolved demand
 */
export function flattenCompositionDemandLeaves(
  root: MealCompositionExpansionNode,
  context: {
    planned_meal_id: string;
    meal_name: string | null;
  },
): GroceryDemandCandidate[] {
  const out: GroceryDemandCandidate[] = [];

  const visit = (
    node: MealCompositionExpansionNode,
    viaRecipeName: string | null,
  ): void => {
    if (node.kind === 'meal_document') {
      for (const child of node.children ?? []) {
        visit(child, viaRecipeName);
      }
      return;
    }

    if (node.kind === 'recipe_portion') {
      const recipeName = node.name || viaRecipeName;
      const children = node.children ?? [];
      if (children.length > 0) {
        // Nested recipe_portion children (one-level boundary) are leaves —
        // convert them to unresolved demand rather than recursing.
        for (const child of children) {
          if (child.kind === 'recipe_portion') {
            out.push({
              name: child.name,
              quantity: child.quantity,
              unit: child.unit,
              food_object_id: null,
              planned_meal_id: context.planned_meal_id,
              notes: appendNote(
                child.notes,
                child.notes?.includes(NESTED_RECIPE_BOUNDARY_NOTE)
                  ? null
                  : NESTED_RECIPE_BOUNDARY_NOTE,
              ),
              contributor: {
                planned_meal_id: context.planned_meal_id,
                meal_name: context.meal_name,
                via_recipe_name: recipeName,
                provenance: child.provenance,
              },
            });
          } else {
            visit(child, recipeName);
          }
        }
        return;
      }

      // Unexpanded recipe portion → honest unresolved demand (not a silent drop).
      out.push({
        name: node.name,
        quantity: node.quantity,
        unit: node.unit,
        food_object_id: null,
        planned_meal_id: context.planned_meal_id,
        notes: node.notes ?? 'referenced recipe unavailable for ingredient expansion',
        contributor: {
          planned_meal_id: context.planned_meal_id,
          meal_name: context.meal_name,
          via_recipe_name: recipeName,
          provenance: node.provenance,
        },
      });
      return;
    }

    if (
      node.kind === 'direct_component' ||
      node.kind === 'recipe_ingredient' ||
      node.kind === 'unresolved'
    ) {
      const via =
        node.kind === 'recipe_ingredient' || node.provenance.recipe_meal_document_id
          ? viaRecipeName
          : null;
      const label = contributorLabel(context.meal_name, via);
      out.push({
        name: node.name,
        quantity: node.quantity,
        unit: node.unit,
        food_object_id: node.food_object_id ?? null,
        planned_meal_id: context.planned_meal_id,
        notes: appendNote(node.notes, via ? label : null),
        contributor: {
          planned_meal_id: context.planned_meal_id,
          meal_name: context.meal_name,
          via_recipe_name: via,
          provenance: node.provenance,
        },
      });
    }
  };

  visit(root, null);
  return out;
}

/** Collect recipe document ids referenced by planned meal typed composition. */
export function collectRecipeIdsFromPlannedMeals(meals: PlannedMeal[]): string[] {
  const ids = new Set<string>();
  for (const meal of meals) {
    const doc = plannedMealToMealDocument(meal);
    for (const component of doc.components ?? []) {
      if (
        (component.component_kind === 'recipe_document' || component.recipe_meal_document_id) &&
        component.recipe_meal_document_id
      ) {
        ids.add(component.recipe_meal_document_id);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Person-scoped recipe resolver for grocery expansion.
 * Archived recipes remain readable (GET-by-id). Does not mutate documents.
 */
export async function loadPersonScopedRecipeResolver(
  personId: string,
  meals: PlannedMeal[],
): Promise<(recipeMealDocumentId: string) => MealDocument | null> {
  const ids = collectRecipeIdsFromPlannedMeals(meals);
  const map = new Map<string, MealDocument>();
  await Promise.all(
    ids.map(async (id) => {
      const doc = await getMealDocumentForPerson(personId, id);
      if (doc) map.set(id, doc);
    }),
  );
  return (recipeMealDocumentId: string) => map.get(recipeMealDocumentId) ?? null;
}

/**
 * Expand one planned meal into grocery demand candidates via the typed
 * composition boundary. Never mutates the planned meal or saved recipes.
 */
export function expandPlannedMealToDemandCandidates(
  meal: PlannedMeal,
  resolveRecipe?: (recipeMealDocumentId: string) => MealDocument | null | undefined,
): GroceryDemandCandidate[] {
  const doc = plannedMealToMealDocument(meal);
  const tree = expandMealComposition(doc, {
    resolveRecipe,
    plan_id: meal.plan_id,
    plan_day_id: meal.plan_day_id,
    planned_meal_id: meal.id,
  });
  return flattenCompositionDemandLeaves(tree, {
    planned_meal_id: meal.id,
    meal_name: meal.name ?? null,
  });
}

export function buildExpansionSourceDetail(
  contributors: GroceryDemandContributor[],
): Record<string, unknown> {
  return {
    expansion_contributors: contributors.map((c) => ({
      planned_meal_id: c.planned_meal_id,
      meal_name: c.meal_name,
      via_recipe_name: c.via_recipe_name,
      provenance: c.provenance,
    })),
  };
}
