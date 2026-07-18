import { mealDocumentToPlannedMealPayload, templateMealToMealDocument } from '@/lib/meals/adapters';
import type { MealDocument } from '@/lib/meals/types';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import type {
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
  PlanWeekPattern,
  PlanWeekPatternDay,
  PlannedMealType,
} from '@/lib/plans/types';

function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function countTemplateMeals(template: PlanDayTemplate): number {
  const inSlots = template.slots.reduce((sum, slot) => sum + slot.meals.length, 0);
  return inSlots + (template.unassigned_meals?.length ?? 0);
}

export function countPatternMeals(pattern: PlanWeekPattern): number {
  return pattern.days.reduce((sum, day) => {
    const slotMeals = day.slots.reduce((slotSum, slot) => slotSum + slot.meals.length, 0);
    return sum + slotMeals + (day.unassigned_meals?.length ?? 0);
  }, 0);
}

export function buildTemplateMealFromDocument(
  doc: MealDocument,
  mealType: PlannedMealType,
  existing?: PlanDayTemplateMeal,
): PlanDayTemplateMeal {
  const payload = mealDocumentToPlannedMealPayload(doc);
  const sourceId = existing?.source_planned_meal_id ?? newLocalId();
  return {
    source_planned_meal_id: sourceId,
    name: doc.title.trim() || null,
    meal_type: mealType,
    payload,
    protein_score_10: existing?.protein_score_10 ?? null,
    is_main_meal: existing?.is_main_meal ?? false,
    psq_multiplier: existing?.psq_multiplier ?? 1,
    meal_derived_data: existing?.meal_derived_data ?? {
      protein_score_10: null,
      is_main_meal: false,
      meal_calories: 0,
      meal_protein_g: 0,
      psq_multiplier: 1,
    },
    nds_confidence: existing?.nds_confidence ?? 'medium',
    source_template_id: existing?.source_template_id ?? null,
    source_imported_meal_id: existing?.source_imported_meal_id ?? null,
    nds_version: existing?.nds_version ?? NDS_VERSION,
    classifier_version: existing?.classifier_version ?? CLASSIFIER_VERSION,
  };
}

export function templateMealDocument(meal: PlanDayTemplateMeal): MealDocument {
  return templateMealToMealDocument(meal);
}

export function moveArrayItem<T>(items: T[], fromIndex: number, direction: 'up' | 'down'): T[] {
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  return next;
}

export function duplicateTemplateMeal(meal: PlanDayTemplateMeal): PlanDayTemplateMeal {
  return {
    ...meal,
    source_planned_meal_id: newLocalId(),
    name: meal.name ? `${meal.name} (Copy)` : null,
  };
}

export function formatTemplateSlotLabel(slot: PlanDayTemplateSlot): string {
  if (slot.slot_label?.trim()) return slot.slot_label;
  if (slot.target_time) return slot.target_time;
  return `Slot ${slot.slot_ordinal}`;
}

export function cloneTemplateMealForSnapshot(meal: PlanDayTemplateMeal): PlanDayTemplateMeal {
  return {
    ...meal,
    source_planned_meal_id: newLocalId(),
    payload: structuredClone(meal.payload),
  };
}

export function cloneTemplateSlotsForPatternSnapshot(
  slots: PlanDayTemplateSlot[],
): PlanDayTemplateSlot[] {
  return slots.map((slot) => ({
    ...slot,
    source_plan_slot_id: newLocalId(),
    meals: slot.meals.map(cloneTemplateMealForSnapshot),
  }));
}

export function snapshotDayTemplateIntoPatternDay(
  template: PlanDayTemplate,
  dayOffset: number,
  existing?: PlanWeekPatternDay,
): PlanWeekPatternDay {
  return {
    day_offset: dayOffset,
    source_plan_day_id: existing?.source_plan_day_id ?? newLocalId(),
    source_date_local: existing?.source_date_local ?? `Day ${dayOffset + 1}`,
    source_day_template_id: template.id,
    slots: cloneTemplateSlotsForPatternSnapshot(template.slots),
    unassigned_meals: (template.unassigned_meals ?? []).map(cloneTemplateMealForSnapshot),
  };
}

export function duplicatePatternDaySnapshot(
  sourceDay: PlanWeekPatternDay,
  dayOffset: number,
  existing?: PlanWeekPatternDay,
): PlanWeekPatternDay {
  return {
    day_offset: dayOffset,
    source_plan_day_id: existing?.source_plan_day_id ?? newLocalId(),
    source_date_local: existing?.source_date_local ?? `Day ${dayOffset + 1}`,
    source_day_template_id: sourceDay.source_day_template_id ?? null,
    slots: cloneTemplateSlotsForPatternSnapshot(sourceDay.slots),
    unassigned_meals: (sourceDay.unassigned_meals ?? []).map(cloneTemplateMealForSnapshot),
  };
}
