import type { PlannedMeal } from '@/lib/plans/types';
import { canonicalMealForStructuralSlot } from '@/lib/plans/canonicalSlotMeals';

/**
 * Plans Home treats one Meal Rhythm occasion as one planned-meal container.
 * This intentionally does not change generic plan authoring semantics.
 */
export function findExistingCanonicalSlotMeal(args: {
  meals: readonly PlannedMeal[];
  planId: string;
  planDayId: string;
  planSlotId: string;
}): PlannedMeal | null {
  return canonicalMealForStructuralSlot(
    args.meals.filter(
      (meal) =>
        meal.plan_id === args.planId &&
        meal.plan_day_id === args.planDayId &&
        meal.plan_slot_id === args.planSlotId,
    ),
  );
}

/** Packet 13D compatibility export; Packet 13E applies the guard to Day too. */
export const findExistingPlansHomeSlotMeal = findExistingCanonicalSlotMeal;
