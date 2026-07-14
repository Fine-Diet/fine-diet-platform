/**
 * Pure helpers for planned-meal journal payloads (exact + adjusted).
 * Does not mutate planned meal source records.
 */
import { plannedMealToMealDocument, macrosToJournal } from '@/lib/meals/adapters';
import { scaleTopLevelMealNutrition } from '@/lib/meals/recompute';
import type {
  GroupedMealEntryPayload,
  LoggedMealGroup,
  MealComponent,
  MealDocument,
  MealNutrition,
  MealStep,
} from '@/lib/meals/types';
import { MEAL_SCHEMA_VERSION } from '@/lib/meals/types';
import type { PlannedMeal } from './types';

export interface BuildExactPlannedMealPayloadOptions {
  consumed_servings?: number;
  instance_note?: string | null;
}

function cloneComponent(component: MealComponent): MealComponent {
  return { ...component, macros: { ...component.macros } };
}

function cloneSteps(steps: MealStep[] | undefined): MealStep[] | undefined {
  if (!steps) return undefined;
  return steps.map((step) => ({ ...step }));
}

function emptyNutrition(): MealNutrition {
  return { calories: null, macros: { protein_g: null, carbs_g: null, fat_g: null } };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function buildGroupedPayloadFromDocument(
  document: MealDocument,
  options?: BuildExactPlannedMealPayloadOptions,
): GroupedMealEntryPayload {
  const consumed = isPositiveNumber(options?.consumed_servings)
    ? options!.consumed_servings
    : 1;

  const consumedNutrition = scaleTopLevelMealNutrition(document, consumed);
  const components = document.components.map(cloneComponent);
  const steps = cloneSteps(document.steps);

  const documentReviewFlagged =
    document.review_state === 'needs_review' ||
    document.components.some((c) => c.needs_review);

  const group: LoggedMealGroup = {
    schema_version: MEAL_SCHEMA_VERSION,
    name: document.title,
    source_meal_document_id: document.id ?? null,
    source_imported_meal_id: document.source.source_imported_meal_id ?? null,
    source_planned_meal_id: document.source.source_planned_meal_id ?? null,
    source_template_id: document.source.source_template_id ?? null,
    components,
    ...(steps ? { steps } : {}),
    totals: consumedNutrition ?? emptyNutrition(),
    planned_servings: document.recipe_yield_servings ?? null,
    consumed_servings: consumed,
    detached_from_source: false,
    instance_notes: options?.instance_note ?? null,
    needs_review: documentReviewFlagged || consumedNutrition == null,
  };

  const payload: GroupedMealEntryPayload = {
    name: document.title,
    quantity: consumed,
    unit: 'serving',
    meal_group: group,
  };

  if (consumedNutrition) {
    if (consumedNutrition.calories != null) payload.calories = consumedNutrition.calories;
    const journalMacros = macrosToJournal(consumedNutrition.macros);
    if (Object.keys(journalMacros).length > 0) payload.macros = journalMacros;
  }

  if (group.source_planned_meal_id) {
    payload.source_planned_meal_id = group.source_planned_meal_id;
  }

  return payload;
}

/**
 * Build a grouped intake payload for "Log as planned" from the planned meal snapshot.
 * The source PlannedMeal is never mutated.
 */
export function buildExactPlannedMealIntakePayload(
  planned: PlannedMeal,
  options?: BuildExactPlannedMealPayloadOptions,
): GroupedMealEntryPayload {
  const document = plannedMealToMealDocument(planned);
  const payload = buildGroupedPayloadFromDocument(document, options);
  if (payload.meal_group) {
    payload.meal_group.logged_as_planned = true;
  }
  payload.logged_as_planned = true;
  return payload;
}

/**
 * Build a grouped intake payload for adjusted actual consumption from an edited snapshot.
 * Marks logged_as_planned=false and preserves provenance from the document source.
 */
export function buildAdjustedPlannedMealIntakePayload(
  document: MealDocument,
  options?: BuildExactPlannedMealPayloadOptions,
): GroupedMealEntryPayload {
  const payload = buildGroupedPayloadFromDocument(document, options);
  if (payload.meal_group) {
    payload.meal_group.logged_as_planned = false;
    payload.meal_group.detached_from_source = true;
  }
  payload.logged_as_planned = false;
  return payload;
}

/** Returns true when a planned meal already has a linked journal entry. */
export function plannedMealAlreadyLogged(meal: PlannedMeal): boolean {
  return meal.execution_state === 'eaten' && Boolean(meal.journal_entry_id);
}
