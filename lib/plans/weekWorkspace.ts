import type {
  PlanDay,
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanSlot,
  PlannedMeal,
} from './types';

export const WEEK_NAME_DRAFT_VERSION = 1 as const;
export const WEEK_NAME_DRAFT_PREFIX = 'fine-diet:week-name-draft:v1';

function parseDateKey(dateLocal: string): Date {
  const [year, month, day] = dateLocal.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

export function defaultWeekPlanName(weekStart: string): string {
  const formatted = parseDateKey(weekStart).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `(Autosaved) Week of ${formatted}`;
}

export function weekNameDraftKey(personId: string, weekStart: string): string {
  return `${WEEK_NAME_DRAFT_PREFIX}:${encodeURIComponent(personId)}:${weekStart}`;
}

export function loadWeekNameDraft(
  storage: Pick<Storage, 'getItem'>,
  personId: string,
  weekStart: string,
): string | null {
  try {
    const parsed = JSON.parse(storage.getItem(weekNameDraftKey(personId, weekStart)) ?? 'null') as {
      version?: number;
      name?: unknown;
    } | null;
    return parsed?.version === WEEK_NAME_DRAFT_VERSION &&
      typeof parsed.name === 'string' &&
      parsed.name.trim()
      ? parsed.name
      : null;
  } catch {
    return null;
  }
}

export function saveWeekNameDraft(
  storage: Pick<Storage, 'setItem'>,
  personId: string,
  weekStart: string,
  name: string,
): void {
  storage.setItem(
    weekNameDraftKey(personId, weekStart),
    JSON.stringify({
      version: WEEK_NAME_DRAFT_VERSION,
      name,
      savedAt: new Date().toISOString(),
    }),
  );
}

export function datedDayTemplate(
  day: PlanDay,
  slots: PlanSlot[],
  meals: PlannedMeal[],
): PlanDayTemplate {
  const slotIds = new Set(slots.map((slot) => slot.id));
  const toTemplateMeal = (meal: PlannedMeal): PlanDayTemplateMeal => ({
    source_planned_meal_id: meal.id,
    name: meal.name,
    meal_type: meal.meal_type,
    payload: meal.payload,
    protein_score_10: meal.protein_score_10,
    is_main_meal: meal.is_main_meal,
    psq_multiplier: meal.psq_multiplier,
    meal_derived_data: meal.meal_derived_data,
    nds_confidence: meal.nds_confidence,
    source_template_id: meal.source_template_id,
    source_imported_meal_id: meal.source_imported_meal_id,
    nds_version: meal.nds_version,
    classifier_version: meal.classifier_version,
  });

  return {
    id: '',
    person_id: day.person_id,
    name: `(Autosaved) Day of ${parseDateKey(day.date_local).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`,
    scope: 'day',
    source_plan_id: day.plan_id,
    source_plan_day_id: day.id,
    source_date_local: day.date_local,
    slots: slots
      .slice()
      .sort((a, b) => a.slot_ordinal - b.slot_ordinal)
      .map((slot) => ({
        source_plan_slot_id: slot.id,
        slot_ordinal: slot.slot_ordinal,
        slot_block: slot.slot_block,
        slot_label: slot.slot_label,
        target_time: slot.target_time,
        meals: meals
          .filter((meal) => meal.plan_slot_id === slot.id)
          .map(toTemplateMeal),
      })),
    unassigned_meals: meals
      .filter((meal) => !meal.plan_slot_id || !slotIds.has(meal.plan_slot_id))
      .map(toTemplateMeal),
    apply_policy: 'append',
    created_at: day.created_at,
    updated_at: day.updated_at,
  };
}

export interface WeekMealSummary {
  id: string;
  name: string;
  kind: 'Meal' | 'Single Item';
  components: string[];
  calories: number | null;
}

export interface WeekOccasionSummary {
  slotId: string;
  label: string;
  meals: WeekMealSummary[];
  calories: number | null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function plannedMealCalories(meal: PlannedMeal): number | null {
  const payload = meal.payload as {
    totals?: { calories?: unknown };
    items?: Array<{ calories?: unknown }>;
  };
  const total = numeric(payload.totals?.calories);
  if (total !== null) return total;
  const derived = numeric(
    (meal.meal_derived_data as { meal_calories?: unknown } | null)?.meal_calories,
  );
  if (derived !== null) return derived;
  const itemCalories = (payload.items ?? []).map((item) => numeric(item.calories));
  return itemCalories.some((value) => value !== null)
    ? itemCalories.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
}

export function summarizeDayOccasions(
  slots: PlanSlot[],
  meals: PlannedMeal[],
): WeekOccasionSummary[] {
  return slots
    .slice()
    .sort((a, b) => a.slot_ordinal - b.slot_ordinal)
    .flatMap((slot) => {
      const slotMeals = meals.filter((meal) => meal.plan_slot_id === slot.id);
      if (slotMeals.length === 0) return [];
      const summaries = slotMeals.map((meal) => {
        const payload = meal.payload as {
          items?: Array<{
            name?: unknown;
            canonical_name?: unknown;
            quantity?: unknown;
            quantity_value?: unknown;
            unit?: unknown;
          }>;
        };
        const components = (payload.items ?? []).flatMap((item) => {
          const name =
            typeof item.name === 'string'
              ? item.name
              : typeof item.canonical_name === 'string'
                ? item.canonical_name
                : null;
          if (!name) return [];
          const quantity = numeric(item.quantity_value ?? item.quantity);
          const unit = typeof item.unit === 'string' ? item.unit : '';
          return [`${name}${quantity === null ? '' : ` · ${quantity}${unit ? ` ${unit}` : ''}`}`];
        });
        return {
          id: meal.id,
          name: meal.name?.trim() || 'Untitled meal',
          kind: meal.source_template_id || components.length > 1 ? 'Meal' as const : 'Single Item' as const,
          components,
          calories: plannedMealCalories(meal),
        };
      });
      const calories = summaries.some((meal) => meal.calories !== null)
        ? summaries.reduce((sum, meal) => sum + (meal.calories ?? 0), 0)
        : null;
      return [{
        slotId: slot.id,
        label: slot.slot_label?.trim() || slot.target_time || `Occasion ${slot.slot_ordinal}`,
        meals: summaries,
        calories,
      }];
    });
}
