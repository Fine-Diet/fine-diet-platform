import type { PlannedMeal } from '@/lib/plans/types';

/**
 * Plans Home treats one Meal Rhythm occasion as one planned-meal container.
 * This intentionally does not change generic plan authoring semantics.
 */
export function findExistingPlansHomeSlotMeal(args: {
  meals: readonly PlannedMeal[];
  planId: string;
  planDayId: string;
  planSlotId: string;
}): PlannedMeal | null {
  return (
    args.meals.find(
      (meal) =>
        meal.plan_id === args.planId &&
        meal.plan_day_id === args.planDayId &&
        meal.plan_slot_id === args.planSlotId,
    ) ?? null
  );
}
