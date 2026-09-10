import type {
  IntakePayload,
  JournalEntryPayload,
  MealScheduleContext,
} from './types';
import type { LogNutritionSingleItemDraftEntryV1 } from '@/lib/logDraft/logNutritionDraft';

const PROVENANCE_KEYS = [
  'source_planned_meal_id',
  'logged_as_planned',
  'log_draft_session_id',
  'log_draft_entry_id',
] as const;

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Build the complete flat-intake payload used by the committed editor.
 *
 * This is intentionally a replacement payload, not a shallow patch. Selecting
 * a different food therefore replaces identity, title, nutrition, serving
 * basis, and measures as one coherent snapshot while retaining only journal
 * provenance that belongs to the historical entry itself.
 */
export function buildCommittedSingleItemPayload(input: {
  current: JournalEntryPayload;
  replacement?: LogNutritionSingleItemDraftEntryV1 | null;
  quantity: number;
  unit: string;
  mealScheduleContext?: MealScheduleContext | null;
}): IntakePayload {
  const current = input.current as IntakePayload;
  const replacement = input.replacement;
  const payload: IntakePayload = {
    name: replacement?.title ?? current.name,
    quantity: input.quantity,
    unit: input.unit,
  };

  const calories = finiteOrUndefined(
    replacement ? replacement.calories : current.calories,
  );
  if (calories !== undefined) payload.calories = calories;

  const sourceMacros = replacement?.macros ?? current.macros;
  if (sourceMacros) {
    const protein = finiteOrUndefined(sourceMacros.protein);
    const carbs = finiteOrUndefined(sourceMacros.carbs);
    const fat = finiteOrUndefined(sourceMacros.fat);
    if (protein !== undefined || carbs !== undefined || fat !== undefined) {
      payload.macros = {
        ...(protein !== undefined ? { protein } : {}),
        ...(carbs !== undefined ? { carbs } : {}),
        ...(fat !== undefined ? { fat } : {}),
      };
    }
  }

  const foodObjectId = replacement?.foodObjectId ?? current.foodObjectId;
  if (foodObjectId) payload.foodObjectId = foodObjectId;

  const servingSizeG = finiteOrUndefined(
    replacement ? replacement.servingSizeG : current.servingSizeG,
  );
  if (servingSizeG !== undefined) payload.servingSizeG = servingSizeG;

  const measures = replacement ? replacement.measures : current.measures;
  if (measures?.length) {
    payload.measures = measures.map((measure) => ({ ...measure }));
  }

  for (const key of PROVENANCE_KEYS) {
    const value = current[key];
    if (value !== undefined) {
      (payload as Record<string, unknown>)[key] = value;
    }
  }

  if (input.mealScheduleContext) {
    payload.meal_schedule_context = { ...input.mealScheduleContext };
  }

  return payload;
}
