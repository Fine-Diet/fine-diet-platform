import { scaleMealNutrition } from './recompute';
import { recoverGroundedPerServingNutrition } from './componentAmount';
import {
  MEAL_SCHEMA_VERSION,
  type GroupedMealEntryPayload,
  type LoggedMealGroup,
  type MealDocument,
  type MealNutrition,
  type MealSourceType,
} from './types';

function hasNutrition(nutrition: MealNutrition): boolean {
  return (
    nutrition.calories != null ||
    nutrition.macros.protein_g != null ||
    nutrition.macros.carbs_g != null ||
    nutrition.macros.fat_g != null
  );
}

function sourceType(group: LoggedMealGroup): MealSourceType {
  if (group.source_planned_meal_id) return 'planned_meal';
  if (group.source_imported_meal_id) return 'imported';
  if (group.source_meal_document_id || group.source_template_id) return 'saved_meal';
  return 'manual';
}

/**
 * Project one grouped journal snapshot into the canonical, client-safe
 * MealDocument shape consumed by the shared Meal Composer. The returned object
 * is detached data; saving it never targets the source document.
 */
export function mealDocumentFromLoggedGroup(
  payload: GroupedMealEntryPayload & { meal_group: LoggedMealGroup },
): MealDocument {
  const group = payload.meal_group;
  const consumed =
    Number.isFinite(group.consumed_servings) && group.consumed_servings > 0
      ? group.consumed_servings
      : 1;
  const perServing = hasNutrition(group.totals)
    ? scaleMealNutrition(group.totals, 1 / consumed)
    : null;
  const yieldServings =
    typeof group.planned_servings === 'number' &&
    Number.isFinite(group.planned_servings) &&
    group.planned_servings > 0
      ? group.planned_servings
      : null;
  const kind = group.steps?.length ? 'recipe' : 'meal';
  const components = group.components.map(recoverGroundedPerServingNutrition);
  const needsReview =
    group.needs_review || components.some((component) => component.needs_review);

  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: group.source_meal_document_id,
    person_id: null,
    kind,
    review_state: needsReview ? 'needs_review' : 'confirmed',
    title: group.name || payload.name || 'Meal',
    description: null,
    intents: [],
    meal_type_hint: null,
    components,
    ...(group.steps
      ? { steps: group.steps.map((step) => ({ ...step })) }
      : {}),
    yield:
      kind === 'recipe' && yieldServings
        ? { servings: yieldServings, confirmed: true }
        : null,
    recipe_yield_servings: kind === 'recipe' ? yieldServings : null,
    serving_label: payload.unit ?? 'serving',
    prep_notes: null,
    per_serving: perServing,
    totals:
      perServing && kind === 'recipe' && yieldServings
        ? scaleMealNutrition(perServing, yieldServings)
        : perServing,
    source: {
      source_type: sourceType(group),
      source_imported_meal_id: group.source_imported_meal_id,
      source_template_id: group.source_template_id,
      source_planned_meal_id: group.source_planned_meal_id,
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}
