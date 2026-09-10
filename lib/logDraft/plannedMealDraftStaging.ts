import {
  mealDraftEntryFromDocument,
  type LogNutritionDraftContextV1,
  type LogNutritionMealDraftEntryV1,
} from '@/lib/logDraft/logNutritionDraft';
import { plannedMealToMealDocument } from '@/lib/meals/adapters';
import type { PlannedMeal } from '@/lib/plans/types';

/**
 * Build the one grouped Quick Log draft entry for an exact pending planned
 * Meal. Generic slot matches never override the explicit ID, and handled
 * planned Meals cannot be converted back into pending consumption.
 */
export function exactPendingPlannedMealDraftEntry(
  meals: PlannedMeal[],
  plannedMealId: string,
): LogNutritionMealDraftEntryV1 | null {
  const meal = meals.find(
    (candidate) =>
      candidate.id === plannedMealId &&
      candidate.execution_state === 'pending',
  );
  if (!meal) return null;
  return mealDraftEntryFromDocument(plannedMealToMealDocument(meal), {
    sourceKey: `planned:${meal.id}`,
    plannedMealId: meal.id,
    plannedMode: 'exact',
  });
}

/**
 * A successful Quick Log commit consumes its one-shot Plan execution intent.
 * Preserve the ordinary dated Meal Rhythm context while ensuring the next
 * draft cannot carry or recommit the handled PlannedMeal.
 */
export function retireConsumedPlannedMealDraftContext(
  context: LogNutritionDraftContextV1,
): LogNutritionDraftContextV1 {
  if (!context.plannedMealId) return context;
  return {
    ...context,
    plannedMealId: null,
  };
}
