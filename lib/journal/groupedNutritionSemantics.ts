import type { JournalEntryPayload } from './types';

export interface MealDerivedPayload {
  calories?: number;
  macros?: { protein?: number };
  quantity?: number;
  name?: string;
}

/**
 * Grouped Meal top-level calories/macros are already absolute consumed totals.
 * NDS meal-derived calculation normally multiplies flat-food per-serving values
 * by payload.quantity, so grouped entries must use an effective quantity of 1.
 */
export function payloadForMealDerived(
  payload: JournalEntryPayload,
): MealDerivedPayload {
  const record = payload as Record<string, unknown>;
  const mealGroup = record.meal_group;
  const derived = payload as MealDerivedPayload;
  if (
    typeof mealGroup !== 'object' ||
    mealGroup === null ||
    Array.isArray(mealGroup)
  ) {
    return derived;
  }
  return { ...derived, quantity: 1 };
}
