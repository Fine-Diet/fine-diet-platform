/**
 * Packet 3 — contributor-aware Replace in meal routing from grocery rows.
 */

import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import type { GroceryItem, PlannedMeal } from './types';

export interface ReplaceInMealOption {
  meal_id: string;
  label: string;
  href: string;
  kind: 'import_edit' | 'plan_day_edit';
}

export type ReplaceInMealRoute =
  | { kind: 'none' }
  | { kind: 'single'; option: ReplaceInMealOption }
  | { kind: 'choice'; options: ReplaceInMealOption[] };

function mealLabel(meal: PlannedMeal): string {
  return meal.name?.trim() || 'Unnamed meal';
}

function scopeFallbackDate(planDayDates: Record<string, string>): string {
  const dates = Object.values(planDayDates).filter(Boolean).sort();
  return dates[0] ?? '';
}

function buildOption(
  meal: PlannedMeal,
  planId: string,
  planDayDates: Record<string, string>,
): ReplaceInMealOption {
  if (meal.source_imported_meal_id) {
    return {
      meal_id: meal.id,
      label: mealLabel(meal),
      href: APP_ROUTE_BUILDERS.planImport(meal.source_imported_meal_id),
      kind: 'import_edit',
    };
  }

  const dayDate = planDayDates[meal.plan_day_id];
  if (!dayDate) {
    return {
      meal_id: meal.id,
      label: mealLabel(meal),
      href: `${APP_ROUTE_BUILDERS.planDayWithPlan(scopeFallbackDate(planDayDates), planId)}&editMeal=${encodeURIComponent(meal.id)}`,
      kind: 'plan_day_edit',
    };
  }

  const href = `${APP_ROUTE_BUILDERS.planDayWithPlan(dayDate, planId)}&editMeal=${encodeURIComponent(meal.id)}`;

  return {
    meal_id: meal.id,
    label: mealLabel(meal),
    href,
    kind: 'plan_day_edit',
  };
}

export function buildReplaceInMealRoute(
  item: Pick<GroceryItem, 'source_planned_meal_ids'>,
  meals: PlannedMeal[],
  planId: string,
  planDayDates: Record<string, string>,
): ReplaceInMealRoute {
  const contributors = item.source_planned_meal_ids
    .map((id) => meals.find((meal) => meal.id === id))
    .filter((meal): meal is PlannedMeal => !!meal);

  if (contributors.length === 0) return { kind: 'none' };
  if (contributors.length === 1) {
    return {
      kind: 'single',
      option: buildOption(contributors[0]!, planId, planDayDates),
    };
  }

  return {
    kind: 'choice',
    options: contributors.map((meal) => buildOption(meal, planId, planDayDates)),
  };
}
