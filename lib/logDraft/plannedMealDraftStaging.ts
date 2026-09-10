import {
  mealDraftEntryFromDocument,
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
