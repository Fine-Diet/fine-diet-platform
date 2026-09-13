import type { PlanDayTemplate, PlanDayTemplateMeal, PlanWeekPattern } from './types';

export const LOCAL_NEW_MEAL_PROVENANCE = 'local_new' as const;

export type LocalNewMealStamp = {
  [LOCAL_NEW_MEAL_PROVENANCE]?: true;
};

export function stampLocalNewMeal<T extends PlanDayTemplateMeal>(
  meal: T,
): T & { local_new: true } {
  return {
    ...meal,
    local_new: true,
  };
}

export function isStampedLocalNewMeal(
  meal: PlanDayTemplateMeal & LocalNewMealStamp,
): boolean {
  return meal.local_new === true;
}

export function stripLocalNewMealProvenance<T extends PlanDayTemplateMeal>(
  meal: T,
): T {
  if (!('local_new' in meal)) return meal;
  const { local_new: _localNew, ...rest } = meal as T & { local_new?: true };
  return rest as T;
}

function stripLocalNewMealProvenanceFromSlots<
  T extends { meals: PlanDayTemplateMeal[] },
>(slots: T[]): T[] {
  return slots.map((slot) => ({
    ...slot,
    meals: slot.meals.map(stripLocalNewMealProvenance),
  }));
}

export function stripLocalNewMealProvenanceFromTemplate(
  draft: PlanDayTemplate,
): PlanDayTemplate {
  return {
    ...draft,
    slots: stripLocalNewMealProvenanceFromSlots(draft.slots),
    unassigned_meals: (draft.unassigned_meals ?? []).map(stripLocalNewMealProvenance),
  };
}

export function stripLocalNewMealProvenanceFromWeekPattern(
  pattern: PlanWeekPattern,
): PlanWeekPattern {
  return {
    ...pattern,
    days: pattern.days.map((day) => ({
      ...day,
      slots: stripLocalNewMealProvenanceFromSlots(day.slots),
      unassigned_meals: (day.unassigned_meals ?? []).map(stripLocalNewMealProvenance),
    })),
  };
}

export function collectTrustedLocalNewMealIds(
  draft: PlanDayTemplate,
  registry?: ReadonlySet<string>,
): Set<string> {
  const trusted = new Set<string>(registry ?? []);
  const meals = [
    ...draft.slots.flatMap((slot) => slot.meals ?? []),
    ...(draft.unassigned_meals ?? []),
  ];
  for (const meal of meals) {
    if (isStampedLocalNewMeal(meal) && meal.source_planned_meal_id) {
      trusted.add(meal.source_planned_meal_id);
    }
  }
  return trusted;
}
