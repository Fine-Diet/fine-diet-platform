import { computeMealDerivedFromPayload } from '@/lib/nds/mealDerived';
import { confidenceForMealItems } from './ndsConfidence';
import type {
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
  PlanWeekPattern,
} from './types';

interface PayloadForDerived {
  items?: Array<{ food_object_id?: string | null; calories?: number | null }>;
  totals?: { calories?: number; protein_g?: number };
}

/**
 * Given a (potentially edited) planned_meal payload, recompute the meal-level
 * NDS shape used by SlotCard badges and day projection.
 */
export function recomputeMealNDSShape(
  name: string | null,
  payload: PayloadForDerived,
): {
  protein_score_10: number | null;
  is_main_meal: boolean;
  psq_multiplier: number;
  meal_derived_data: {
    protein_score_10: number | null;
    is_main_meal: boolean;
    meal_calories: number;
    meal_protein_g: number;
    psq_multiplier: number;
  };
  nds_confidence: 'high' | 'medium' | 'low';
} {
  const totals = payload.totals ?? {};
  const derived = computeMealDerivedFromPayload({
    calories: totals.calories,
    macros: { protein: totals.protein_g },
    quantity: 1,
    name: name ?? undefined,
  });
  const confidence = confidenceForMealItems(payload.items ?? []);
  return {
    protein_score_10: derived.protein_score_10,
    is_main_meal: derived.is_main_meal,
    psq_multiplier: derived.psq_multiplier,
    meal_derived_data: derived,
    nds_confidence: confidence,
  };
}

export function recomputeTemplateMealDerivedFields(
  meal: PlanDayTemplateMeal,
): PlanDayTemplateMeal {
  const shape = recomputeMealNDSShape(meal.name, meal.payload as PayloadForDerived);
  return {
    ...meal,
    protein_score_10: shape.protein_score_10,
    is_main_meal: shape.is_main_meal,
    psq_multiplier: shape.psq_multiplier,
    meal_derived_data: shape.meal_derived_data,
    nds_confidence: shape.nds_confidence,
  };
}

function recomputeTemplateSlotDerivedFields(
  slot: PlanDayTemplateSlot,
): PlanDayTemplateSlot {
  return {
    ...slot,
    meals: slot.meals.map(recomputeTemplateMealDerivedFields),
  };
}

export function recomputeTemplateDerivedFields(template: PlanDayTemplate): PlanDayTemplate {
  return {
    ...template,
    slots: template.slots.map(recomputeTemplateSlotDerivedFields),
    unassigned_meals: (template.unassigned_meals ?? []).map(recomputeTemplateMealDerivedFields),
  };
}

export function recomputePatternDerivedFields(pattern: PlanWeekPattern): PlanWeekPattern {
  return {
    ...pattern,
    days: pattern.days.map((day) => ({
      ...day,
      slots: day.slots.map(recomputeTemplateSlotDerivedFields),
      unassigned_meals: (day.unassigned_meals ?? []).map(recomputeTemplateMealDerivedFields),
    })),
  };
}
