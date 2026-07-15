/**
 * Server-side trust boundary for log_adjusted payloads.
 *
 * Client derivation is the primary path, but the execute endpoint rejects
 * review-required or internally inconsistent grouped payloads before writing.
 * Totals are recomputed from components + consumed servings via the shared
 * pure derivation path and compared within integer rounding tolerances.
 */
import { macrosToJournal } from '@/lib/meals/adapters';
import type {
  GroupedMealEntryPayload,
  LoggedMealGroup,
  MealDocument,
  MealNutrition,
} from '@/lib/meals/types';
import { MEAL_SCHEMA_VERSION } from '@/lib/meals/types';
import { deriveAdjustedConsumption } from './plannedMealAdjustDerivation';

function cloneComponent(component: LoggedMealGroup['components'][number]) {
  return {
    ...component,
    macros: { ...component.macros },
    ...(component.measures ? { measures: component.measures.map((m) => ({ ...m })) } : {}),
  };
}

function mealDocumentFromLoggedMealGroup(group: LoggedMealGroup): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: group.source_meal_document_id,
    kind: 'meal',
    review_state: group.needs_review ? 'needs_review' : 'confirmed',
    title: group.name,
    description: null,
    intents: [],
    meal_type_hint: null,
    components: group.components.map(cloneComponent),
    yield: null,
    recipe_yield_servings: group.planned_servings,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: group.totals,
    source: {
      source_type: 'planned_meal',
      source_planned_meal_id: group.source_planned_meal_id,
      source_template_id: group.source_template_id,
      source_imported_meal_id: group.source_imported_meal_id,
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}

function roundedEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.round(a) === Math.round(b);
}

function assertNutritionMatchesDerived(
  label: string,
  submitted: MealNutrition | null | undefined,
  derived: MealNutrition | null,
): void {
  if (!derived || derived.calories == null) {
    throw new Error('Adjusted intake payload could not be recomputed from components.');
  }
  if (!roundedEqual(submitted?.calories, derived.calories)) {
    throw new Error(`Adjusted intake payload has inconsistent ${label} calorie totals.`);
  }
  const submittedMacros = submitted?.macros ?? {
    protein_g: null,
    carbs_g: null,
    fat_g: null,
  };
  if (!roundedEqual(submittedMacros.protein_g, derived.macros.protein_g)) {
    throw new Error(`Adjusted intake payload has inconsistent ${label} protein totals.`);
  }
  if (!roundedEqual(submittedMacros.carbs_g, derived.macros.carbs_g)) {
    throw new Error(`Adjusted intake payload has inconsistent ${label} carbs totals.`);
  }
  if (!roundedEqual(submittedMacros.fat_g, derived.macros.fat_g)) {
    throw new Error(`Adjusted intake payload has inconsistent ${label} fat totals.`);
  }
}

export function assertAdjustedIntakePayloadAcceptable(payload: GroupedMealEntryPayload): void {
  const group = payload.meal_group;
  if (!group) {
    throw new Error('Adjusted intake payload must include a meal_group.');
  }
  if (group.needs_review) {
    throw new Error('Adjusted intake payload requires nutrition review.');
  }
  if (group.components.some((c) => c.needs_review)) {
    throw new Error('Adjusted intake payload has components needing review.');
  }

  const consumedServings = group.consumed_servings ?? payload.quantity ?? 1;
  if (!(typeof consumedServings === 'number' && consumedServings > 0)) {
    throw new Error('Adjusted intake payload must include consumed servings greater than 0.');
  }

  const baseDocument = mealDocumentFromLoggedMealGroup(group);
  const derived = deriveAdjustedConsumption({
    baseDocument,
    title: group.name,
    components: group.components.map(cloneComponent),
    consumedServings,
    note: group.instance_notes,
  });

  if (derived.needsReview || derived.consumedNutrition == null) {
    throw new Error('Adjusted intake payload requires nutrition review.');
  }

  assertNutritionMatchesDerived('group', group.totals, derived.consumedNutrition);

  if (
    payload.calories != null &&
    !roundedEqual(payload.calories, derived.consumedNutrition.calories)
  ) {
    throw new Error('Adjusted intake payload has inconsistent top-level calorie totals.');
  }

  const journalMacros = macrosToJournal(derived.consumedNutrition.macros);
  if (payload.macros?.protein != null && !roundedEqual(payload.macros.protein, journalMacros.protein)) {
    throw new Error('Adjusted intake payload has inconsistent top-level protein totals.');
  }
  if (payload.macros?.carbs != null && !roundedEqual(payload.macros.carbs, journalMacros.carbs)) {
    throw new Error('Adjusted intake payload has inconsistent top-level carbs totals.');
  }
  if (payload.macros?.fat != null && !roundedEqual(payload.macros.fat, journalMacros.fat)) {
    throw new Error('Adjusted intake payload has inconsistent top-level fat totals.');
  }
}
