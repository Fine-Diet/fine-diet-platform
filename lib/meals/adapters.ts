/**
 * Meal Object Foundation — Packet 1: Adapters (contract only, pure functions)
 *
 * Pure mapping helpers between the legacy meal/ingredient shapes and the
 * canonical contract in ./types. No I/O, no DB, no network, no AI, no
 * nutrition recompute. These are NOT wired into runtime in P1 — they exist so
 * later packets can unify the divergent shapes behind one contract.
 *
 * Conservative by design:
 *   - Macros are normalized to CanonicalMacros (`_g` keys) in both directions.
 *   - Food links are normalized to `food_object_id` (snake_case).
 *   - `nutrition_basis` is set explicitly per source (no guessing at read time).
 *   - Legacy rows without grounding fields default to a sane, lossless state.
 *   - Some adapters are intentionally PARTIAL where the source is a draft
 *     (e.g. imported meals): they produce a `draft` document and never invent
 *     nutrition numbers. Such partial behavior is documented on each function.
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§2, §3).
 */

import type {
  IntakePayload,
  MealTemplate,
  MealTemplateItem,
} from '@/lib/journal/types';
import type {
  EatOutAttachableItem,
  EatOutAttachablePayload,
  ImportedMeal,
  ImportedMealDraftIngredient,
  IngredientMatchEntry,
  PlannedMeal,
  PlannedMealPayload,
  PlanDayTemplateMeal,
} from '@/lib/plans/types';
import { recomputeMealNutrition } from './recompute';
import {
  MEAL_SCHEMA_VERSION,
  type CanonicalMacros,
  type GroupedMealEntryPayload,
  type HouseholdMeasure,
  type LoggedMealGroup,
  type MealComponent,
  type MealComponentSourceKind,
  type MealDocument,
  type MealDocumentIntent,
  type MealMatchStatus,
  type MealNutrition,
  type MealStep,
  type MealTypeHint,
} from './types';

// ============================================================================
// Internal id + macro helpers (pure)
// ============================================================================

let __componentSeq = 0;

/**
 * Deterministic-ish stable id for a component when the source has none.
 * Prefers a provided id; otherwise derives from index. Falls back to a
 * monotonic counter so callers always get a non-empty `component_id`.
 */
function makeComponentId(provided?: string | null, index?: number): string {
  if (provided && provided.trim().length > 0) return provided;
  if (typeof index === 'number') return `component_${index}`;
  __componentSeq += 1;
  return `component_auto_${__componentSeq}`;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Empty canonical macros (all null = "not available"). */
export function emptyCanonicalMacros(): CanonicalMacros {
  return { protein_g: null, carbs_g: null, fat_g: null };
}

/** Journal/camelCase macros ({protein,carbs,fat}) → CanonicalMacros (`_g`). */
export function macrosFromJournal(
  macros: { protein?: number | null; carbs?: number | null; fat?: number | null } | null | undefined
): CanonicalMacros {
  return {
    protein_g: numOrNull(macros?.protein),
    carbs_g: numOrNull(macros?.carbs),
    fat_g: numOrNull(macros?.fat),
  };
}

/** Plans/eat-out snake `_g` macros → CanonicalMacros. */
export function macrosFromSnake(
  macros:
    | {
        protein_g?: number | null;
        carbs_g?: number | null;
        fat_g?: number | null;
        fiber_g?: number | null;
        added_sugar_g?: number | null;
      }
    | null
    | undefined
): CanonicalMacros {
  const out: CanonicalMacros = {
    protein_g: numOrNull(macros?.protein_g),
    carbs_g: numOrNull(macros?.carbs_g),
    fat_g: numOrNull(macros?.fat_g),
  };
  if (macros && macros.fiber_g != null) out.fiber_g = numOrNull(macros.fiber_g);
  if (macros && macros.added_sugar_g != null) out.added_sugar_g = numOrNull(macros.added_sugar_g);
  return out;
}

/**
 * Compatibility macro shape accepted by planned-meal item readers.
 *
 * The canonical planned-meal component macro shape is camelCase
 * ({protein, carbs, fat}) — see componentToPlannedMealItem below, which is
 * the only writer new rows should ever go through. Historical rows written
 * by the pre-Phase-3 `SlotEditor.templateToPayload` path used snake `_g`
 * keys ({protein_g, carbs_g, fat_g}) instead. This type — and
 * `macrosFromCompat` — let every reader of planned-meal item macros (the
 * composer adapter below, plus lib/plans/ndsConfidence.ts) accept both
 * shapes with one shared interpretation, so a legacy row and a new row are
 * never read differently by different call sites. Per-field: camelCase
 * wins when both are present (there is no legitimate case where a single
 * item carries conflicting values for the same macro).
 */
export interface CompatMacrosInput {
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

/** Normalizes a compat macro object to canonical camelCase (for further use with macrosFromJournal, or direct comparison). */
export function macrosFromCompat(
  macros: CompatMacrosInput | null | undefined
): { protein: number | null; carbs: number | null; fat: number | null } {
  return {
    protein: numOrNull(macros?.protein ?? macros?.protein_g),
    carbs: numOrNull(macros?.carbs ?? macros?.carbs_g),
    fat: numOrNull(macros?.fat ?? macros?.fat_g),
  };
}

/** CanonicalMacros → journal/camelCase macros (drops null fields). */
export function macrosToJournal(macros: CanonicalMacros): {
  protein?: number;
  carbs?: number;
  fat?: number;
} {
  const out: { protein?: number; carbs?: number; fat?: number } = {};
  if (macros.protein_g != null) out.protein = macros.protein_g;
  if (macros.carbs_g != null) out.carbs = macros.carbs_g;
  if (macros.fat_g != null) out.fat = macros.fat_g;
  return out;
}

/**
 * CanonicalMacros → plans/eat-out snake `_g` macros (0 for null, absolute totals).
 *
 * LEGACY COMPAT ONLY: zero-fills nulls because historical PlannedMeal /
 * EatOut attachable payloads required numbers. Prefer
 * `macrosToSnakeNullable` from `./legacyCompat` when honesty matters —
 * Package 3 consumers must not treat zero-filled nulls as measured zeros.
 */
export function macrosToSnakeTotals(macros: CanonicalMacros): {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} {
  return {
    protein_g: macros.protein_g ?? 0,
    carbs_g: macros.carbs_g ?? 0,
    fat_g: macros.fat_g ?? 0,
  };
}

function cloneMeasures(
  measures: Array<{ unit: string; grams: number; label?: string }> | null | undefined
): HouseholdMeasure[] | undefined {
  if (!measures || measures.length === 0) return undefined;
  return measures.map((m) => ({ unit: m.unit, grams: m.grams, ...(m.label ? { label: m.label } : {}) }));
}

/** Sum a list of components' nutrition into a totals block (no scaling). */
export function sumComponentNutrition(components: MealComponent[]): MealNutrition {
  let calories: number | null = null;
  const macros: CanonicalMacros = emptyCanonicalMacros();

  const add = (target: 'protein_g' | 'carbs_g' | 'fat_g', value: number | null) => {
    if (value == null) return;
    macros[target] = (macros[target] ?? 0) + value;
  };

  for (const c of components) {
    if (c.calories != null) calories = (calories ?? 0) + c.calories;
    add('protein_g', c.macros.protein_g);
    add('carbs_g', c.macros.carbs_g);
    add('fat_g', c.macros.fat_g);
  }

  return { calories, macros };
}

// ============================================================================
// Component-level adapters (legacy item shapes ⇄ MealComponent)
// ============================================================================

/**
 * journal IntakePayload (a single logged food) → MealComponent.
 * Journal stores per-serving macros + a quantity multiplier ⇒ 'per_serving'.
 * Has explicit user/grounded macros but no match lineage ⇒ 'user_entered',
 * 'none'. needs_review stays false (the value is a recorded fact).
 */
export function intakePayloadToComponent(
  payload: IntakePayload,
  index?: number
): MealComponent {
  return {
    component_id: makeComponentId(payload.foodObjectId, index),
    name: payload.name ?? '',
    quantity: numOrNull(payload.quantity),
    unit: payload.unit ?? null,
    food_object_id: payload.foodObjectId ?? null,
    serving_size_g: numOrNull(payload.servingSizeG) ?? undefined,
    measures: cloneMeasures(payload.measures),
    calories: numOrNull(payload.calories),
    macros: macrosFromJournal(payload.macros),
    nutrition_basis: 'per_serving',
    match_status: payload.foodObjectId ? 'matched' : 'none',
    source_kind: payload.foodObjectId ? 'food_object' : 'user_entered',
    needs_review: false,
  };
}

/** MealComponent → journal IntakePayload (per-serving spelling). */
export function componentToIntakePayload(component: MealComponent): IntakePayload {
  const payload: IntakePayload = {
    name: component.name,
    macros: macrosToJournal(component.macros),
  };
  if (component.quantity != null) payload.quantity = component.quantity;
  if (component.unit != null) payload.unit = component.unit;
  if (component.calories != null) payload.calories = component.calories;
  if (component.food_object_id != null) payload.foodObjectId = component.food_object_id;
  if (component.serving_size_g != null) payload.servingSizeG = component.serving_size_g;
  if (component.measures && component.measures.length > 0) payload.measures = component.measures;
  return payload;
}

/**
 * Saved Meal item (journal_meal_templates.items[]) → MealComponent.
 * Template items store the item's own full nutrition ⇒ 'per_component'.
 */
export function mealTemplateItemToComponent(
  item: MealTemplateItem,
  index?: number
): MealComponent {
  return {
    component_id: makeComponentId(item.id, index),
    name: item.name ?? '',
    quantity: numOrNull(item.quantity),
    unit: item.unit ?? null,
    food_object_id: item.foodObjectId ?? null,
    serving_size_g: numOrNull(item.servingSizeG) ?? undefined,
    measures: cloneMeasures(item.measures),
    calories: numOrNull(item.calories),
    macros: macrosFromJournal(item.macros),
    nutrition_basis: 'per_component',
    match_status: item.foodObjectId ? 'matched' : 'none',
    source_kind: item.foodObjectId ? 'food_object' : 'user_entered',
    needs_review: false,
  };
}

/** MealComponent → Saved Meal item. `id` is required on MealTemplateItem. */
export function componentToMealTemplateItem(component: MealComponent): MealTemplateItem {
  const item: MealTemplateItem = {
    id: component.component_id,
    name: component.name,
    macros: macrosToJournal(component.macros),
  };
  if (component.quantity != null) item.quantity = component.quantity;
  if (component.unit != null) item.unit = component.unit;
  if (component.calories != null) item.calories = component.calories;
  if (component.food_object_id != null) item.foodObjectId = component.food_object_id;
  if (component.serving_size_g != null) item.servingSizeG = component.serving_size_g;
  if (component.measures && component.measures.length > 0) item.measures = component.measures;
  return item;
}

/** Eat-out attachable item (snake `_g`, snake food link) → MealComponent. */
export function eatOutAttachableItemToComponent(
  item: EatOutAttachableItem,
  index?: number
): MealComponent {
  return {
    component_id: makeComponentId(item.food_object_id, index),
    name: item.name,
    quantity: numOrNull(item.quantity),
    unit: item.unit ?? null,
    food_object_id: item.food_object_id ?? null,
    calories: numOrNull(item.calories),
    macros: macrosFromSnake(item.macros),
    nutrition_basis: 'per_component',
    match_status: item.food_object_id ? 'matched' : 'none',
    source_kind: item.food_object_id ? 'food_object' : 'user_entered',
    needs_review: false,
  };
}

/** MealComponent → eat-out attachable item. */
export function componentToEatOutAttachableItem(component: MealComponent): EatOutAttachableItem {
  return {
    name: component.name,
    quantity: component.quantity,
    unit: component.unit,
    calories: component.calories,
    macros: {
      protein_g: component.macros.protein_g,
      carbs_g: component.macros.carbs_g,
      fat_g: component.macros.fat_g,
    },
    food_object_id: component.food_object_id,
  };
}

/**
 * Imported-meal draft ingredient → MealComponent, optionally merged with the
 * grounding/match entry (imported_meals.ingredient_match_json) for the same
 * index. Draft ingredients carry parse provenance but NO nutrition; the match
 * entry supplies per-serving estimate + grounding when present.
 *
 * PARTIAL by design: when no match entry is supplied the component has null
 * nutrition, match_status 'none', and needs_review=true (it is an unreviewed
 * draft, not a recorded fact). No numbers are invented.
 */
export function importedDraftIngredientToComponent(
  ingredient: ImportedMealDraftIngredient,
  match?: IngredientMatchEntry | null,
  index?: number
): MealComponent {
  const matchStatus: MealMatchStatus = match?.match_status ?? 'none';
  const sourceKind: MealComponentSourceKind = match?.source_kind ?? 'default_guess';
  const hasNutrition = match != null;

  return {
    component_id: makeComponentId(match?.source_id ?? null, index),
    name: ingredient.normalized_name ?? ingredient.raw_text,
    raw_text: ingredient.raw_text,
    normalized_name: ingredient.normalized_name,
    preparation_note: ingredient.preparation_note,
    quantity: numOrNull(ingredient.quantity_value),
    unit: ingredient.quantity_unit ?? null,
    food_object_id:
      match?.source_kind === 'food_object' ? match.source_id : null,
    // Defensive: real imported rows can carry a match entry whose
    // `per_serving_estimate` is null/absent. Optional-chain the calories read so
    // one incomplete match never throws and crashes the whole adapter/search.
    calories: hasNutrition ? numOrNull(match?.per_serving_estimate?.calories) : null,
    macros: hasNutrition
      ? macrosFromSnake(match?.per_serving_estimate)
      : emptyCanonicalMacros(),
    // Match estimates are per-serving of the meal (audit §2.2 / §5).
    nutrition_basis: 'per_serving',
    match_status: matchStatus,
    source_kind: sourceKind,
    // Drafts are unreviewed unless a strong match grounded them.
    needs_review: matchStatus === 'matched' ? false : true,
  };
}

/**
 * Standalone IngredientMatchEntry → MealComponent (when no draft ingredient is
 * available, e.g. reading ingredient_match_json directly).
 */
export function ingredientMatchEntryToComponent(
  match: IngredientMatchEntry,
  index?: number
): MealComponent {
  return {
    component_id: makeComponentId(match.source_id, index ?? match.ingredient_index),
    name: match.normalized_name ?? match.raw_text,
    raw_text: match.raw_text,
    normalized_name: match.normalized_name,
    preparation_note: match.preparation_note,
    quantity: numOrNull(match.quantity_value),
    unit: match.quantity_unit ?? null,
    food_object_id: match.source_kind === 'food_object' ? match.source_id : null,
    // Defensive: tolerate match entries with a null/absent per_serving_estimate.
    calories: numOrNull(match.per_serving_estimate?.calories),
    macros: macrosFromSnake(match.per_serving_estimate),
    nutrition_basis: 'per_serving',
    match_status: match.match_status,
    source_kind: match.source_kind,
    needs_review: match.match_status !== 'matched',
  };
}

// ============================================================================
// Planned-meal payload item (read-shape) → MealComponent
// ============================================================================

/**
 * planned_meals.payload.items[] entry as written by lib/plans/validators.ts
 * (PlannedMealItemSchema). The payload is an open record at the type level, so
 * this read-shape is intentionally permissive.
 */
/**
 * planned_meals.payload.items[] read shape.
 *
 * `match_status`/`needs_review`/`source_kind` are Phase 3 (Plans integration)
 * additions — NOT part of PlannedMealItemSchema (lib/plans/validators.ts),
 * which is enforced only for AI-authored content (plan generation / imports),
 * never for the manual create/update write path (see
 * pages/api/journal/plans/meals/index.ts and [mealId].ts, which persist
 * `payload` as opaque JSON). They are optional so every pre-Phase-3 row
 * (which never wrote these keys) reads back with EXACTLY the same derived
 * defaults as before — this is a strictly additive, backward-compatible
 * read-shape extension, not a second planned-meal component schema.
 */
interface PlannedMealItemReadShape {
  name?: string;
  quantity?: number;
  unit?: string;
  food_object_id?: string | null;
  serving_size_g?: number;
  calories?: number;
  /**
   * Accepts both the canonical camelCase shape ({protein, carbs, fat}) that
   * componentToPlannedMealItem writes, and the legacy snake `_g` shape that
   * SlotEditor.templateToPayload wrote before the Phase 3 compatibility
   * correction — see macrosFromCompat.
   */
  macros?: CompatMacrosInput;
  estimate_note?: string;
  match_status?: MealMatchStatus;
  needs_review?: boolean;
  source_kind?: MealComponentSourceKind;
}

interface PlannedMealPayloadReadShape {
  items?: PlannedMealItemReadShape[];
  totals?: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
  notes_md?: string;
}

function plannedMealItemToComponent(
  item: PlannedMealItemReadShape,
  index?: number
): MealComponent {
  const hasFoodObject = item.food_object_id != null && item.food_object_id !== '';
  return {
    component_id: makeComponentId(item.food_object_id ?? null, index),
    name: item.name ?? '',
    preparation_note: item.estimate_note ?? null,
    quantity: numOrNull(item.quantity),
    unit: item.unit ?? null,
    food_object_id: item.food_object_id ?? null,
    serving_size_g: numOrNull(item.serving_size_g) ?? undefined,
    calories: numOrNull(item.calories),
    macros: macrosFromJournal(macrosFromCompat(item.macros)),
    nutrition_basis: 'per_component',
    match_status: item.match_status ?? (hasFoodObject ? 'matched' : 'none'),
    source_kind: item.source_kind ?? (hasFoodObject ? 'food_object' : 'user_entered'),
    needs_review: item.needs_review ?? false,
  };
}

// ============================================================================
// Document-level adapters
// ============================================================================

function mealTypeHintFrom(value: unknown): MealTypeHint | null {
  if (value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack') {
    return value;
  }
  if (value === 'unknown') return 'unknown';
  return null;
}

function intentsFromMealType(hint: MealTypeHint | null): MealDocumentIntent[] {
  if (hint && hint !== 'unknown') return [hint];
  return [];
}

/**
 * Saved Meal (journal_meal_templates) → MealDocument.
 * kind='meal' (assembled set, no prep steps). Saved meals are confirmed and
 * carry NO NDS shape, so `nds` is null. Totals are summed from item nutrition;
 * `per_serving` is left null because saved meals do not declare a yield.
 */
export function mealTemplateToMealDocument(template: MealTemplate): MealDocument {
  const components = (template.items ?? []).map((item, i) =>
    mealTemplateItemToComponent(item, i)
  );

  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: template.id ?? null,
    kind: 'meal',
    review_state: 'confirmed',
    title: template.name,
    description: null,
    intents: [],
    meal_type_hint: null,
    components,
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: sumComponentNutrition(components),
    source: { source_type: 'saved_meal', source_template_id: template.id ?? null },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at:
      template.created_at instanceof Date ? template.created_at.toISOString() : null,
    updated_at:
      template.updated_at instanceof Date ? template.updated_at.toISOString() : null,
  };
}

/**
 * Imported meal → MealDocument DRAFT.
 *
 * PARTIAL by design. Reads the review draft (parsed_payload_json) and merges
 * per-index grounding from ingredient_match_json. Produces a `draft` (or
 * `needs_review`) document — never `confirmed`, because the yield-confirm gate
 * (decision #4) belongs to P4. When parse_status is 'parsed'/'failed' etc. the
 * review_state is mapped conservatively. No nutrition is invented; ungrounded
 * ingredients carry null nutrition and needs_review=true.
 */
export function importedMealToMealDocumentDraft(imported: ImportedMeal): MealDocument {
  const draft = imported.parsed_payload_json;
  const matches = imported.ingredient_match_json ?? [];

  const components: MealComponent[] = (draft?.ingredients ?? []).map((ing, i) =>
    importedDraftIngredientToComponent(ing, matches[i] ?? null, i)
  );

  const steps: MealStep[] | undefined =
    draft?.steps && draft.steps.length > 0
      ? draft.steps.map((s) => ({ step_number: s.step_number, instruction: s.instruction }))
      : undefined;

  const kind = steps && steps.length > 0 ? 'recipe' : 'meal';

  // Conservative review-state mapping. A parsed draft still needs explicit
  // review + yield confirm before it becomes a confirmed document (P4).
  const reviewState =
    imported.parse_status === 'parsed' ? 'needs_review' : 'draft';

  const servings = numOrNull(draft?.servings);
  const estimate = imported.nutrition_estimate_json;
  const perServing: MealNutrition | null = estimate
    ? {
        // Defensive: tolerate an estimate whose per_serving block is null/absent.
        calories: numOrNull(estimate.per_serving?.calories),
        macros: macrosFromSnake(estimate.per_serving),
      }
    : null;

  const hint = mealTypeHintFrom(draft?.meal_type_hint);

  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: imported.id ?? null,
    person_id: imported.person_id ?? null,
    kind,
    review_state: reviewState,
    title: draft?.title ?? imported.title,
    description: draft?.description ?? null,
    intents: intentsFromMealType(hint),
    meal_type_hint: hint,
    components,
    ...(steps ? { steps } : {}),
    yield: servings != null ? { servings, confirmed: false } : null,
    recipe_yield_servings: servings,
    serving_label: null,
    prep_notes: null,
    per_serving: perServing,
    totals: null,
    source: {
      source_type: 'imported',
      source_url: imported.source_url ?? null,
      source_imported_meal_id: imported.id ?? null,
    },
    // ImportedMeal carries a required MealNDSShape — pass it through verbatim.
    nds: {
      protein_score_10: imported.protein_score_10,
      is_main_meal: imported.is_main_meal,
      psq_multiplier: imported.psq_multiplier,
      meal_derived_data: imported.meal_derived_data,
      nds_confidence: imported.nds_confidence,
    },
    nds_version: imported.nds_version ?? null,
    classifier_version: imported.classifier_version ?? null,
    created_at: imported.created_at ?? null,
    updated_at: imported.updated_at ?? null,
  };
}

/**
 * Planned meal → MealDocument.
 * kind='meal'. Components come from payload.items[]; totals from payload.totals
 * (snake `_g`). NDS is passed through verbatim (PlannedMeal carries a required
 * MealNDSShape). Provenance points back to the planned meal id.
 */
export function plannedMealToMealDocument(planned: PlannedMeal): MealDocument {
  const payload = (planned.payload ?? {}) as PlannedMealPayloadReadShape;
  const components = (payload.items ?? []).map((item, i) =>
    plannedMealItemToComponent(item, i)
  );

  const totals: MealNutrition | null = payload.totals
    ? {
        calories: numOrNull(payload.totals.calories),
        macros: macrosFromSnake(payload.totals),
      }
    : null;

  const hint = mealTypeHintFrom(planned.meal_type);

  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: planned.id ?? null,
    person_id: planned.person_id ?? null,
    kind: 'meal',
    review_state: 'confirmed',
    title: planned.name ?? '',
    description: null,
    intents: intentsFromMealType(hint),
    meal_type_hint: hint,
    components,
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: typeof payload.notes_md === 'string' ? payload.notes_md : null,
    per_serving: null,
    totals,
    source: {
      source_type: 'planned_meal',
      source_planned_meal_id: planned.id ?? null,
      source_template_id: planned.source_template_id ?? null,
      source_imported_meal_id: planned.source_imported_meal_id ?? null,
    },
    nds: {
      protein_score_10: planned.protein_score_10,
      is_main_meal: planned.is_main_meal,
      psq_multiplier: planned.psq_multiplier,
      meal_derived_data: planned.meal_derived_data,
      nds_confidence: planned.nds_confidence,
    },
    nds_version: planned.nds_version ?? null,
    classifier_version: planned.classifier_version ?? null,
    created_at: planned.created_at ?? null,
    updated_at: planned.updated_at ?? null,
  };
}

/**
 * MealComponent → planned_meals.payload.items[] entry — the inverse of
 * plannedMealItemToComponent above (Phase 3: Plans integration).
 *
 * `contribution` must be the component's DETERMINISTICALLY-SCALED nutrition
 * contribution (i.e. one entry of `recomputeMealNutrition(components).components[i].nutrition`),
 * not the component's stored per-serving/per-component base value.
 * `plannedMealItemToComponent` reads planned-meal items back with
 * `nutrition_basis: 'per_component'` (meaning "this number IS the item's
 * total contribution already") — writing the unscaled base value here would
 * silently corrupt nutrition on the very next read. `null` (an ungrounded or
 * needs-review component) writes no calories/macros at all rather than
 * inventing them — this is what lets plan creation stay unblocked for
 * progressively-grounded components (Phase 3 guardrail #7) while never
 * fabricating a number recompute couldn't safely derive.
 *
 * match_status/needs_review/source_kind ride along as additive fields (see
 * PlannedMealItemReadShape above) so editing a planned meal through the
 * composer and saving it back never downgrades a 'partial'/'guessed' match
 * or a needs-review flag to false.
 */
export function componentToPlannedMealItem(
  component: MealComponent,
  contribution: MealNutrition | null,
): {
  name: string;
  quantity?: number;
  unit?: string;
  food_object_id?: string | null;
  serving_size_g?: number;
  calories?: number;
  macros?: { protein?: number; carbs?: number; fat?: number };
  estimate_note?: string;
  match_status?: MealMatchStatus;
  needs_review?: boolean;
  source_kind?: MealComponentSourceKind;
} {
  const item: ReturnType<typeof componentToPlannedMealItem> = { name: component.name.trim() };
  if (component.quantity != null) item.quantity = component.quantity;
  if (component.unit != null) item.unit = component.unit;
  if (component.food_object_id != null) item.food_object_id = component.food_object_id;
  if (component.serving_size_g != null) item.serving_size_g = component.serving_size_g;
  if (contribution?.calories != null) item.calories = contribution.calories;
  if (contribution) {
    const macros = macrosToJournal(contribution.macros);
    if (Object.keys(macros).length > 0) item.macros = macros;
  }
  if (component.preparation_note) item.estimate_note = component.preparation_note;
  if (component.match_status) item.match_status = component.match_status;
  if (component.needs_review) item.needs_review = true;
  if (component.source_kind) item.source_kind = component.source_kind;
  return item;
}

/**
 * MealDocument (a composer draft, seeded via plannedMealToMealDocument or
 * built fresh) → planned_meals.payload, ready for planService.createMeal /
 * updateMeal (Phase 3: Plans integration). Reuses recomputeMealNutrition —
 * the SAME deterministic recompute the composer reducer already runs after
 * every edit — rather than re-deriving scale factors here, so the written
 * payload can never diverge from what the composer showed the user.
 *
 * This is the canonical composer→plan write conversion; it does not
 * introduce a second planned-meal component schema (see
 * componentToPlannedMealItem's doc comment) and never touches
 * journal_entries — the caller is responsible for calling
 * planService.createMeal/updateMeal, which write planned_meals only.
 */
export function mealDocumentToPlannedMealPayload(doc: MealDocument): PlannedMealPayload {
  const recompute = recomputeMealNutrition(doc.components);
  const items = doc.components.map((component, i) =>
    componentToPlannedMealItem(component, recompute.components[i]?.nutrition ?? null),
  );
  const payload: Record<string, unknown> = {
    items,
    totals: {
      calories: recompute.totals.calories ?? 0,
      ...macrosToSnakeTotals(recompute.totals.macros),
    },
  };
  const notes = (doc.prep_notes ?? '').trim();
  if (notes) payload.notes_md = notes;
  return payload as PlannedMealPayload;
}

/**
 * Reusable day-template meal snapshot → MealDocument for the shared composer.
 * Uses source_planned_meal_id as the document id anchor; never writes back to
 * planned_meals.
 */
export function templateMealToMealDocument(meal: PlanDayTemplateMeal): MealDocument {
  return plannedMealToMealDocument({
    id: meal.source_planned_meal_id,
    person_id: '',
    plan_id: '',
    plan_day_id: '',
    plan_slot_id: null,
    name: meal.name,
    meal_type: meal.meal_type,
    payload: meal.payload,
    protein_score_10: meal.protein_score_10,
    is_main_meal: meal.is_main_meal,
    psq_multiplier: meal.psq_multiplier,
    meal_derived_data: meal.meal_derived_data,
    nds_confidence: meal.nds_confidence,
    execution_state: 'pending',
    journal_entry_id: null,
    source_template_id: meal.source_template_id,
    source_imported_meal_id: meal.source_imported_meal_id,
    reusable_provenance: null,
    nds_version: meal.nds_version,
    classifier_version: meal.classifier_version,
    created_at: '',
    updated_at: '',
  });
}

/**
 * Eat-out attachable payload → MealDocument.
 * kind='meal'. Components from items[]; totals from the payload totals
 * (snake `_g`). No NDS shape on the attachable payload ⇒ nds null. Title is
 * supplied by the caller (the eat-out payload itself has no name).
 */
export function eatOutPayloadToMealDocument(
  payload: EatOutAttachablePayload,
  options?: { title?: string; sourceUrl?: string | null }
): MealDocument {
  const components = (payload.items ?? []).map((item, i) =>
    eatOutAttachableItemToComponent(item, i)
  );

  const hint = mealTypeHintFrom(payload.meal_type);

  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: null,
    kind: 'meal',
    review_state: 'needs_review',
    title: options?.title ?? '',
    description: null,
    intents: intentsFromMealType(hint),
    meal_type_hint: hint,
    components,
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: {
      calories: numOrNull(payload.totals?.calories),
      macros: macrosFromSnake(payload.totals),
    },
    source: {
      source_type: 'eat_out',
      source_url: options?.sourceUrl ?? null,
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}

/**
 * MealDocument → LoggedMealGroup snapshot.
 *
 * Snapshots the document's name, components, steps, and totals into a grouped
 * logged-meal payload. CONSERVATIVE: it does NOT scale nutrition by servings —
 * scaling/recompute is the deterministic recompute service's job (P3). The
 * snapshot totals prefer the document totals, falling back to per_serving.
 * `detached_from_source` starts false; provenance points back to the document.
 */
export function mealDocumentToLoggedMealGroup(
  doc: MealDocument,
  options?: {
    consumed_servings?: number;
    planned_servings?: number | null;
    instance_notes?: string | null;
  }
): LoggedMealGroup {
  const totals: MealNutrition =
    doc.totals ?? doc.per_serving ?? sumComponentNutrition(doc.components);

  const needsReview =
    doc.review_state !== 'confirmed' || doc.components.some((c) => c.needs_review);

  return {
    schema_version: MEAL_SCHEMA_VERSION,
    name: doc.title,
    source_meal_document_id: doc.id ?? null,
    source_imported_meal_id: doc.source.source_imported_meal_id ?? null,
    source_planned_meal_id: doc.source.source_planned_meal_id ?? null,
    source_template_id: doc.source.source_template_id ?? null,
    components: doc.components,
    ...(doc.steps ? { steps: doc.steps } : {}),
    totals,
    planned_servings: options?.planned_servings ?? doc.recipe_yield_servings ?? null,
    consumed_servings: options?.consumed_servings ?? 1,
    detached_from_source: false,
    instance_notes: options?.instance_notes ?? null,
    needs_review: needsReview,
  };
}

/**
 * LoggedMealGroup → journal_entries intake payload (grouped entry shape).
 *
 * Produces a back-compatible GroupedMealEntryPayload: the first-level
 * `name`/`calories`/`macros` mirror the group totals (journal camelCase
 * spelling) so existing readers work unchanged, and the full canonical group
 * rides along under `meal_group`. quantity stays 1 and unit 'serving' for a
 * logged meal. This does NOT write anything — it only builds the payload.
 */
export function loggedMealGroupToIntakePayload(
  group: LoggedMealGroup
): GroupedMealEntryPayload {
  const payload: GroupedMealEntryPayload = {
    name: group.name,
    quantity: 1,
    unit: 'serving',
    macros: macrosToJournal(group.totals.macros),
    meal_group: group,
  };
  if (group.totals.calories != null) payload.calories = group.totals.calories;
  if (group.source_planned_meal_id) payload.source_planned_meal_id = group.source_planned_meal_id;
  return payload;
}
