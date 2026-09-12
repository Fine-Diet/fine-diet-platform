import type { PlanDay, PlanDayTemplate, PlannedMeal } from './types';

export type DayActionOutcome = 'applied' | 'cancelled';

export interface CreateAndApplyResult {
  outcome: DayActionOutcome;
  savedTemplateId?: string;
  savedTemplate?: PlanDayTemplate;
}

export interface DayPlanActionServices {
  instantiatePlanDayTemplate: (
    templateId: string,
    input: {
      target_date_local: string;
      apply_policy: 'append';
      allow_duplicate_append?: boolean;
    },
  ) => Promise<unknown>;
  savePlanDayTemplate: (input: {
    mode: 'draft';
    name: string;
    slots: PlanDayTemplate['slots'];
    unassigned_meals?: PlanDayTemplate['unassigned_meals'];
  }) => Promise<PlanDayTemplate>;
  deleteMeal: (mealId: string) => Promise<unknown>;
  updateMeal: (
    mealId: string,
    input: {
      name?: string;
      meal_type?: string;
      payload?: unknown;
    },
  ) => Promise<unknown>;
  createMeal: (input: {
    plan_id: string;
    plan_day_id: string;
    plan_slot_id: string | null;
    name: string;
    meal_type?: string;
    payload?: unknown;
    source_template_id?: string | null;
    source_imported_meal_id?: string | null;
    create_context: string;
  }) => Promise<unknown>;
}

export interface ApplyReusableDayPlanInput {
  services: DayPlanActionServices;
  templateId: string;
  dateLocal: string;
  confirmAppend: (message: string) => boolean;
}

export async function applyReusableDayPlan(
  input: ApplyReusableDayPlanInput,
): Promise<DayActionOutcome> {
  const { services, templateId, dateLocal, confirmAppend } = input;
  try {
    await services.instantiatePlanDayTemplate(templateId, {
      target_date_local: dateLocal,
      apply_policy: 'append',
    });
    return 'applied';
  } catch (err) {
    const text = err instanceof Error ? err.message : 'Could not apply this Day Plan.';
    if (!/already has meals|confirm append/i.test(text)) throw err;
    if (!confirmAppend(`${text} Append this Day Plan anyway?`)) return 'cancelled';
    await services.instantiatePlanDayTemplate(templateId, {
      target_date_local: dateLocal,
      apply_policy: 'append',
      allow_duplicate_append: true,
    });
    return 'applied';
  }
}

export interface CreateAndApplyDayPlanInput {
  services: DayPlanActionServices;
  draft: PlanDayTemplate;
  dateLocal: string;
  confirmAppend: (message: string) => boolean;
  existingSavedTemplateId?: string | null;
}

export async function createAndApplyDayPlan(
  input: CreateAndApplyDayPlanInput,
): Promise<CreateAndApplyResult> {
  const { services, draft, dateLocal, confirmAppend, existingSavedTemplateId } = input;
  const saved = existingSavedTemplateId
    ? null
    : await services.savePlanDayTemplate({
        mode: 'draft',
        name: draft.name.trim() || `Day Plan for ${dateLocal}`,
        slots: draft.slots,
        unassigned_meals: draft.unassigned_meals,
      });
  const templateId = existingSavedTemplateId ?? saved!.id;

  const outcome = await applyReusableDayPlan({
    services,
    templateId,
    dateLocal,
    confirmAppend,
  });
  if (outcome === 'cancelled') {
    return {
      outcome: 'cancelled',
      savedTemplateId: templateId,
      savedTemplate: saved ?? undefined,
    };
  }
  return {
    outcome: 'applied',
    savedTemplateId: templateId,
    savedTemplate: saved ?? undefined,
  };
}

function draftMealsFromTemplate(draft: PlanDayTemplate) {
  const slotted = draft.slots.flatMap((slot) =>
    (slot.meals ?? []).map((meal) => ({
      slotId: slot.source_plan_slot_id,
      meal,
    })),
  );
  const unassigned = (draft.unassigned_meals ?? []).map((meal) => ({
    slotId: null as string | null,
    meal,
  }));
  return [...slotted, ...unassigned];
}

export interface SaveDatedDayPlanInput {
  services: DayPlanActionServices;
  draft: PlanDayTemplate;
  dateLocal: string;
  planDays: PlanDay[];
  meals: PlannedMeal[];
}

export async function saveDatedDayPlan(input: SaveDatedDayPlanInput): Promise<DayActionOutcome> {
  const { services, draft, dateLocal, planDays, meals } = input;
  const targetDay = planDays.find((day) => day.date_local === dateLocal);
  if (!targetDay) {
    throw new Error('The dated Day Plan is no longer available. Refresh and try again.');
  }
  const existingMeals = meals.filter((meal) => meal.plan_day_id === targetDay.id);
  if (existingMeals.some((meal) => (meal.execution_state ?? 'pending') !== 'pending')) {
    throw new Error(
      'This day contains a meal that has already been handled. Undo it before editing the dated Day Plan.',
    );
  }
  const existingIds = new Set(existingMeals.map((meal) => meal.id));
  const draftMeals = draftMealsFromTemplate(draft);
  const retainedIds = new Set(
    draftMeals
      .map(({ meal }) => meal.source_planned_meal_id)
      .filter((id) => existingIds.has(id)),
  );

  for (const existing of existingMeals) {
    if (!retainedIds.has(existing.id)) await services.deleteMeal(existing.id);
  }
  for (const { slotId, meal } of draftMeals) {
    if (existingIds.has(meal.source_planned_meal_id)) {
      await services.updateMeal(meal.source_planned_meal_id, {
        name: meal.name ?? undefined,
        meal_type: meal.meal_type,
        payload: meal.payload,
      });
    } else {
      await services.createMeal({
        plan_id: targetDay.plan_id,
        plan_day_id: targetDay.id,
        plan_slot_id: slotId,
        name: meal.name?.trim() || 'Untitled meal',
        meal_type: meal.meal_type,
        payload: meal.payload,
        source_template_id: meal.source_template_id,
        source_imported_meal_id: meal.source_imported_meal_id,
        create_context: 'plans_slot',
      });
    }
  }
  return 'applied';
}

export function embeddedDayPlanDraftId(context: 'week' | 'month', dateLocal: string): string {
  return context === 'week' ? `week-date:${dateLocal}` : `month-date:${dateLocal}`;
}
