/**
 * Pure component grounding helpers — no server/DB imports.
 */
import type { FoodObject } from '@/lib/food/types';
import type { CanonicalMacros, HouseholdMeasure, MealComponent } from './types';

export interface ResolvedGroundingFood {
  food_object_id: string;
  calories: number | null;
  macros: CanonicalMacros;
  serving_size_g: number | null;
  measures?: HouseholdMeasure[];
}

export function foodObjectToGrounding(food: FoodObject): ResolvedGroundingFood {
  const macros: CanonicalMacros = {
    protein_g: food.proteinG,
    carbs_g: food.carbsG,
    fat_g: food.fatG,
  };
  if (food.fiberG != null) macros.fiber_g = food.fiberG;
  if (food.sugarG != null) macros.added_sugar_g = food.sugarG;
  return {
    food_object_id: food.id,
    calories: food.calories,
    macros,
    serving_size_g: typeof food.servingSizeG === 'number' ? food.servingSizeG : null,
    ...(food.measures && food.measures.length > 0
      ? {
          measures: food.measures.map((m) => ({
            unit: m.unit,
            grams: m.grams,
            ...(m.label ? { label: m.label } : {}),
          })),
        }
      : {}),
  };
}

function applyGroundingInPlace(component: MealComponent, food: ResolvedGroundingFood): void {
  component.food_object_id = food.food_object_id;
  component.match_status = 'matched';
  component.source_kind = 'food_object';
  component.nutrition_basis = 'per_serving';
  component.calories = food.calories;
  component.macros = { ...food.macros };
  component.serving_size_g = food.serving_size_g ?? undefined;
  component.quantity_g = undefined;
  if (food.measures) component.measures = food.measures.map((m) => ({ ...m }));
  component.needs_review = false;
}

export function applyGroundingToComponentInPlace(
  component: MealComponent,
  food: ResolvedGroundingFood,
): void {
  applyGroundingInPlace(component, food);
}

export function applyGroundingToComponent(
  component: MealComponent,
  food: ResolvedGroundingFood,
): MealComponent {
  const next: MealComponent = {
    ...component,
    macros: { ...component.macros },
    ...(component.measures ? { measures: component.measures.map((m) => ({ ...m })) } : {}),
  };
  applyGroundingInPlace(next, food);
  return next;
}

/** Clear canonical grounding and nutrition when display identity no longer matches. */
export function detachComponentGrounding(component: MealComponent): MealComponent {
  return {
    ...component,
    food_object_id: null,
    match_status: 'none',
    source_kind: 'user_entered',
    nutrition_basis: 'per_component',
    calories: null,
    macros: { protein_g: null, carbs_g: null, fat_g: null },
    serving_size_g: undefined,
    measures: undefined,
    quantity_g: undefined,
    needs_review: true,
  };
}
