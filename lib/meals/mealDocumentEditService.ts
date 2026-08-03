/**
 * Meal Object Foundation — Packet 12: MealDocument Review / Edit Service
 *
 * Person-scoped, SAFE editing of a reusable canonical MealDocument. Editing a
 * library item changes the reusable SOURCE document going forward — it never
 * rewrites prior logged journal meal instances (those snapshot their own
 * payload.meal_group and remain historical truth). This module therefore makes
 * NO journal writes of any kind.
 *
 * SCOPE / SAFETY (P12 + P13 + P14):
 *   - Only a small, safe field surface can be patched (title, description, prep
 *     notes, serving label, recipe yield servings, review_state, and per-component
 *     display name / raw text / quantity / unit / preparation note / needs_review,
 *     plus step text/order).
 *   - P14 adds GUARDED structural component edits via three explicit operations:
 *     `add_components` (append a conservative, ungrounded-by-default component),
 *     `remove_component_ids` (drop existing components), and
 *     `unmatch_component_ids` (clear a component's food grounding + the canonical
 *     nutrition copied from it). All three are nutrition-affecting and trigger the
 *     same deterministic recompute/review reconciliation as a field edit. The
 *     server validates every referenced id, rejects malformed ops with a 400,
 *     generates stable ids for added components, and re-validates the final
 *     document before persisting. Editing the structure changes the reusable
 *     SOURCE document going forward; it never rewrites logged journal instances.
 *   - P13 adds GUARDED component grounding: a component may be matched to an
 *     existing canonical food by selecting its `food_object_id`. The server
 *     looks the food up (validating it exists) and copies its TRUSTED nutrition
 *     (calories / macros / serving_size_g / measures, per_serving basis) onto the
 *     component, then stamps match_status='matched' / source_kind='food_object'.
 *     match_status / source_kind are NEVER accepted from the patch body — they
 *     are derived from the validated food, so they can't be set to arbitrary
 *     values. No food search, ranking, or nutrition invention happens here.
 *   - Nutrition is recomputed DETERMINISTICALLY via the P3 service and ONLY when
 *     a nutrition-affecting field changed (components / yield) AND every component
 *     is safely recomputable. Otherwise existing per_serving/totals are preserved
 *     verbatim — nutrition is never invented and never silently zeroed. Grounding
 *     a component counts as a nutrition-affecting change; if the grounded
 *     component still cannot be safely scaled (e.g. no quantity/unit), recompute
 *     reconciliation keeps it needs_review.
 *   - review_state transitions are conservative: a document with any needs_review
 *     component stays needs_review; 'confirmed' is downgraded to 'needs_review'
 *     unless recompute is safe, the recipe has a positive yield, and a nutrition
 *     basis exists.
 *   - The pure builder never mutates its inputs. Person scope + final-document
 *     validation are enforced by updateMealDocumentForPerson at the write boundary.
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§3 types, §5
 * recompute policy) + the P12 packet brief.
 */

import { getFoodById } from '@/lib/food/foodServerService';
import type { FoodObject } from '@/lib/food/types';
import {
  applyGroundingToComponent,
  applyGroundingToComponentInPlace,
  foodObjectToGrounding,
  type ResolvedGroundingFood,
} from './componentGrounding';

export {
  applyGroundingToComponent,
  foodObjectToGrounding,
  type ResolvedGroundingFood,
};

import { normalizeMealDocumentComponentContract } from './normalizeMealComponentContract';
import {
  recomputeMealNutrition,
  scaleMealNutrition,
} from './recompute';
import {
  getMealDocumentForPerson,
  updateMealDocumentForPerson,
} from './mealDocumentServerService';
import type {
  CanonicalMacros,
  HouseholdMeasure,
  MealComponent,
  MealDocument,
  MealNutrition,
  MealReviewState,
  MealStep,
  MealYield,
} from './types';

// ============================================================================
// Errors
// ============================================================================

/** Thrown when an edit patch is invalid (caller → 400). */
export class MealDocumentEditValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Invalid meal document edit: ${errors.join('; ')}`);
    this.name = 'MealDocumentEditValidationError';
    this.errors = errors;
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, MealDocumentEditValidationError.prototype);
  }
}

// ============================================================================
// Patch input shapes (the SAFE editable surface)
// ============================================================================

/** Sparse edit for ONE existing component, keyed by component_id. */
export interface MealComponentEditPatch {
  component_id: string;
  /** Display name. */
  name?: string;
  /** Raw/parse text (display provenance). */
  raw_text?: string | null;
  /** Amount in `unit`. null clears it. */
  quantity?: number | null;
  /** Unit string. null clears it. */
  unit?: string | null;
  /** Preparation note (e.g. "diced"). */
  preparation_note?: string | null;
  /** Manual review acknowledgement flag. */
  needs_review?: boolean;
  /**
   * P13 grounding selection: the id of an existing canonical food to match this
   * component to. The SERVER validates the id and copies the food's trusted
   * nutrition onto the component; match_status / source_kind are derived
   * server-side and are NOT accepted from the patch body.
   */
  food_object_id?: string;
}

/**
 * Trusted, server-resolved grounding for a single selected food. Built ONLY
 * from a `getFoodById` lookup (never from the request body), so the nutrition
 * applied to a component is canonical and cannot be spoofed by the caller.
 */
// ResolvedGroundingFood lives in ./componentGrounding (pure) and is re-exported above.

/** Map a canonical FoodObject into the trusted grounding fields we copy. */
// foodObjectToGrounding exported from ./componentGrounding

/** Full replacement of a step (text + order). */
export interface MealStepEditPatch {
  step_number: number;
  instruction: string;
}

/**
 * P14: a NEW component to append to the document. The server generates a
 * stable `component_id`; the caller never supplies one. Conservative by
 * default: ungrounded (food_object_id null, match_status 'none',
 * source_kind 'user_entered', needs_review true) and carries NO invented
 * nutrition unless `food_object_id` immediately grounds it (the server
 * resolves + copies the canonical food's nutrition, exactly like P13).
 */
export interface MealComponentAddPatch {
  /** Display name — required, non-empty. */
  name: string;
  /** Raw/parse text (display provenance). */
  raw_text?: string | null;
  /** Amount in `unit`. Optional; positive when provided. */
  quantity?: number | null;
  /** Unit string. Optional. */
  unit?: string | null;
  /** Preparation note (e.g. "diced"). Optional. */
  preparation_note?: string | null;
  /**
   * Optional immediate grounding: the id of an existing canonical food. The
   * SERVER validates the id and copies the food's trusted nutrition;
   * match_status / source_kind are derived server-side, never trusted from
   * the request body.
   */
  food_object_id?: string;
}

/** The whole safe patch surface accepted by the editor. */
export interface MealDocumentEditPatch {
  title?: string;
  description?: string | null;
  prep_notes?: string | null;
  serving_label?: string | null;
  recipe_yield_servings?: number | null;
  review_state?: MealReviewState;
  components?: MealComponentEditPatch[];
  steps?: MealStepEditPatch[];
  /** P14: NEW components to append (server generates stable ids). */
  add_components?: MealComponentAddPatch[];
  /** P14: ids of existing components to remove from the source document. */
  remove_component_ids?: string[];
  /** P14: ids of existing components whose food grounding should be cleared. */
  unmatch_component_ids?: string[];
  /**
   * Package 5A — full typed component list replacement (preserves recipe
   * references, snapshots, and component_id). Mutually exclusive with
   * components/add/remove/unmatch structural ops.
   */
  set_components?: MealComponent[];
}

export interface BuildEditedMealDocumentResult {
  document: MealDocument;
  /** True when a requested 'confirmed' transition was downgraded as unsafe. */
  review_state_downgraded: boolean;
  /** True when nutrition was deterministically recomputed (vs preserved). */
  recomputed: boolean;
}

export type BuildEditedMealDocumentOutcome =
  | { ok: true; value: BuildEditedMealDocumentResult }
  | { ok: false; errors: string[] };

// ============================================================================
// Validation
// ============================================================================

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_PREP_NOTES = 2000;
const MAX_SERVING_LABEL = 120;
const MAX_PREPARATION_NOTE = 200;
const MAX_INSTRUCTION = 2000;
const MAX_COMPONENT_NAME = 200;
const REVIEW_STATES: MealReviewState[] = ['draft', 'needs_review', 'confirmed'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** True when a nutrition block carries at least one non-null value. */
function hasNutritionValues(n: MealNutrition | null | undefined): n is MealNutrition {
  if (!n) return false;
  const m = n.macros;
  return (
    n.calories != null ||
    m.protein_g != null ||
    m.carbs_g != null ||
    m.fat_g != null ||
    m.fiber_g != null ||
    m.added_sugar_g != null
  );
}

/**
 * Parse + type-validate an unknown patch into a typed MealDocumentEditPatch.
 * Unknown/unsafe top-level fields are IGNORED (never applied); known fields with
 * the wrong type are reported as errors. Person identity is never read here.
 */
export function parseMealDocumentEditPatch(
  input: unknown,
): { ok: true; patch: MealDocumentEditPatch } | { ok: false; errors: string[] } {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['patch must be an object'] };
  }
  const errors: string[] = [];
  const patch: MealDocumentEditPatch = {};

  const validateString = (
    key: keyof MealDocumentEditPatch,
    value: unknown,
    max: number,
    nullable: boolean,
  ): string | null | undefined => {
    if (value === null) {
      if (!nullable) {
        errors.push(`${String(key)} must not be null`);
        return undefined;
      }
      return null;
    }
    if (typeof value !== 'string') {
      errors.push(`${String(key)} must be a string`);
      return undefined;
    }
    if (value.length > max) {
      errors.push(`${String(key)} must be ${max} characters or fewer`);
      return undefined;
    }
    return value;
  };

  if ('title' in input) {
    const v = validateString('title', input.title, MAX_TITLE, false);
    if (typeof v === 'string') {
      if (v.trim().length === 0) errors.push('title must not be empty');
      else patch.title = v;
    }
  }
  if ('description' in input) {
    const v = validateString('description', input.description, MAX_DESCRIPTION, true);
    if (v !== undefined) patch.description = v;
  }
  if ('prep_notes' in input) {
    const v = validateString('prep_notes', input.prep_notes, MAX_PREP_NOTES, true);
    if (v !== undefined) patch.prep_notes = v;
  }
  if ('serving_label' in input) {
    const v = validateString('serving_label', input.serving_label, MAX_SERVING_LABEL, true);
    if (v !== undefined) patch.serving_label = v;
  }

  if ('recipe_yield_servings' in input) {
    const v = input.recipe_yield_servings;
    if (v === null) {
      patch.recipe_yield_servings = null;
    } else if (isPositiveNumber(v)) {
      patch.recipe_yield_servings = v;
    } else {
      errors.push('recipe_yield_servings must be a finite number greater than 0, or null');
    }
  }

  if ('review_state' in input) {
    const v = input.review_state;
    if (typeof v === 'string' && (REVIEW_STATES as string[]).includes(v)) {
      patch.review_state = v as MealReviewState;
    } else {
      errors.push("review_state must be one of 'draft' | 'needs_review' | 'confirmed'");
    }
  }

  if ('components' in input) {
    if (!Array.isArray(input.components)) {
      errors.push('components must be an array');
    } else {
      const seen = new Set<string>();
      const parsed: MealComponentEditPatch[] = [];
      input.components.forEach((raw, idx) => {
        if (!isPlainObject(raw)) {
          errors.push(`components[${idx}] must be an object`);
          return;
        }
        const cid = raw.component_id;
        if (typeof cid !== 'string' || cid.trim().length === 0) {
          errors.push(`components[${idx}].component_id is required`);
          return;
        }
        if (seen.has(cid)) {
          errors.push(`components[${idx}].component_id "${cid}" is duplicated`);
          return;
        }
        seen.add(cid);
        const edit: MealComponentEditPatch = { component_id: cid };
        if ('name' in raw) {
          if (typeof raw.name !== 'string') errors.push(`components[${idx}].name must be a string`);
          else if (raw.name.trim().length === 0) errors.push(`components[${idx}].name must not be empty`);
          else edit.name = raw.name;
        }
        if ('raw_text' in raw) {
          if (raw.raw_text === null) edit.raw_text = null;
          else if (typeof raw.raw_text === 'string') edit.raw_text = raw.raw_text;
          else errors.push(`components[${idx}].raw_text must be a string or null`);
        }
        if ('quantity' in raw) {
          if (raw.quantity === null) edit.quantity = null;
          else if (isPositiveNumber(raw.quantity)) edit.quantity = raw.quantity;
          else errors.push(`components[${idx}].quantity must be a finite number greater than 0, or null`);
        }
        if ('unit' in raw) {
          if (raw.unit === null) edit.unit = null;
          else if (typeof raw.unit === 'string') edit.unit = raw.unit;
          else errors.push(`components[${idx}].unit must be a string or null`);
        }
        if ('preparation_note' in raw) {
          if (raw.preparation_note === null) edit.preparation_note = null;
          else if (typeof raw.preparation_note === 'string') {
            if (raw.preparation_note.length > MAX_PREPARATION_NOTE) {
              errors.push(`components[${idx}].preparation_note must be ${MAX_PREPARATION_NOTE} characters or fewer`);
            } else edit.preparation_note = raw.preparation_note;
          } else errors.push(`components[${idx}].preparation_note must be a string or null`);
        }
        if ('needs_review' in raw) {
          if (typeof raw.needs_review === 'boolean') edit.needs_review = raw.needs_review;
          else errors.push(`components[${idx}].needs_review must be a boolean`);
        }
        if ('food_object_id' in raw) {
          if (typeof raw.food_object_id === 'string' && raw.food_object_id.trim().length > 0) {
            edit.food_object_id = raw.food_object_id;
          } else {
            errors.push(`components[${idx}].food_object_id must be a non-empty string`);
          }
        }
        parsed.push(edit);
      });
      patch.components = parsed;
    }
  }

  if ('steps' in input) {
    if (!Array.isArray(input.steps)) {
      errors.push('steps must be an array');
    } else {
      const parsed: MealStepEditPatch[] = [];
      input.steps.forEach((raw, idx) => {
        if (!isPlainObject(raw)) {
          errors.push(`steps[${idx}] must be an object`);
          return;
        }
        const num = raw.step_number;
        const instruction = raw.instruction;
        if (typeof num !== 'number' || !Number.isFinite(num)) {
          errors.push(`steps[${idx}].step_number must be a finite number`);
        }
        if (typeof instruction !== 'string') {
          errors.push(`steps[${idx}].instruction must be a string`);
        } else if (instruction.length > MAX_INSTRUCTION) {
          errors.push(`steps[${idx}].instruction must be ${MAX_INSTRUCTION} characters or fewer`);
        }
        if (
          typeof num === 'number' &&
          Number.isFinite(num) &&
          typeof instruction === 'string' &&
          instruction.length <= MAX_INSTRUCTION
        ) {
          parsed.push({ step_number: num, instruction });
        }
      });
      patch.steps = parsed;
    }
  }

  // ----- P14: add_components (NEW components, no caller-supplied id) -----
  if ('add_components' in input) {
    if (!Array.isArray(input.add_components)) {
      errors.push('add_components must be an array');
    } else {
      const parsed: MealComponentAddPatch[] = [];
      input.add_components.forEach((raw, idx) => {
        if (!isPlainObject(raw)) {
          errors.push(`add_components[${idx}] must be an object`);
          return;
        }
        if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
          errors.push(`add_components[${idx}].name is required`);
          return;
        }
        if (raw.name.length > MAX_COMPONENT_NAME) {
          errors.push(`add_components[${idx}].name must be ${MAX_COMPONENT_NAME} characters or fewer`);
          return;
        }
        const add: MealComponentAddPatch = { name: raw.name };
        if ('raw_text' in raw) {
          if (raw.raw_text === null) add.raw_text = null;
          else if (typeof raw.raw_text === 'string') add.raw_text = raw.raw_text;
          else errors.push(`add_components[${idx}].raw_text must be a string or null`);
        }
        if ('quantity' in raw) {
          if (raw.quantity === null) add.quantity = null;
          else if (isPositiveNumber(raw.quantity)) add.quantity = raw.quantity;
          else errors.push(`add_components[${idx}].quantity must be a finite number greater than 0, or null`);
        }
        if ('unit' in raw) {
          if (raw.unit === null) add.unit = null;
          else if (typeof raw.unit === 'string') add.unit = raw.unit;
          else errors.push(`add_components[${idx}].unit must be a string or null`);
        }
        if ('preparation_note' in raw) {
          if (raw.preparation_note === null) add.preparation_note = null;
          else if (typeof raw.preparation_note === 'string') {
            if (raw.preparation_note.length > MAX_PREPARATION_NOTE) {
              errors.push(`add_components[${idx}].preparation_note must be ${MAX_PREPARATION_NOTE} characters or fewer`);
            } else add.preparation_note = raw.preparation_note;
          } else errors.push(`add_components[${idx}].preparation_note must be a string or null`);
        }
        if ('food_object_id' in raw) {
          if (typeof raw.food_object_id === 'string' && raw.food_object_id.trim().length > 0) {
            add.food_object_id = raw.food_object_id;
          } else {
            errors.push(`add_components[${idx}].food_object_id must be a non-empty string`);
          }
        }
        parsed.push(add);
      });
      patch.add_components = parsed;
    }
  }

  // ----- P14: remove_component_ids -----
  const parseIdList = (key: 'remove_component_ids' | 'unmatch_component_ids') => {
    const value = (input as Record<string, unknown>)[key];
    if (!Array.isArray(value)) {
      errors.push(`${key} must be an array`);
      return;
    }
    const seen = new Set<string>();
    const ids: string[] = [];
    value.forEach((raw, idx) => {
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        errors.push(`${key}[${idx}] must be a non-empty string`);
        return;
      }
      if (seen.has(raw)) return; // de-dupe harmless repeats in the op list
      seen.add(raw);
      ids.push(raw);
    });
    patch[key] = ids;
  };
  if ('remove_component_ids' in input) parseIdList('remove_component_ids');
  if ('unmatch_component_ids' in input) parseIdList('unmatch_component_ids');

  // Package 5A — full typed component replacement (composer edit path).
  if ('set_components' in input) {
    if (!Array.isArray(input.set_components)) {
      errors.push('set_components must be an array');
    } else {
      const normalized = normalizeMealDocumentComponentContract({
        components: input.set_components,
      }) as { components?: MealComponent[] };
      const components = normalized.components ?? [];
      const ids = new Set<string>();
      components.forEach((component, idx) => {
        if (!component || typeof component !== 'object') {
          errors.push(`set_components[${idx}] must be an object`);
          return;
        }
        if (typeof component.component_id !== 'string' || !component.component_id.trim()) {
          errors.push(`set_components[${idx}].component_id is required`);
          return;
        }
        if (ids.has(component.component_id)) {
          errors.push(`set_components[${idx}].component_id "${component.component_id}" is duplicated`);
          return;
        }
        ids.add(component.component_id);
        if (component.component_kind === 'recipe_document') {
          if (
            typeof component.recipe_meal_document_id !== 'string' ||
            !component.recipe_meal_document_id.trim()
          ) {
            errors.push(
              `set_components[${idx}].recipe_meal_document_id is required for recipe_document`,
            );
          }
          if (
            typeof component.recipe_version_token !== 'string' ||
            !component.recipe_version_token.trim()
          ) {
            errors.push(
              `set_components[${idx}].recipe_version_token is required for recipe_document`,
            );
          }
        }
      });
      patch.set_components = components;
    }
  }

  const hasSetComponents = Array.isArray(patch.set_components);
  const hasStructuralOps =
    (patch.components?.length ?? 0) > 0 ||
    (patch.add_components?.length ?? 0) > 0 ||
    (patch.remove_component_ids?.length ?? 0) > 0 ||
    (patch.unmatch_component_ids?.length ?? 0) > 0;
  if (hasSetComponents && hasStructuralOps) {
    errors.push(
      'set_components cannot be combined with components/add_components/remove_component_ids/unmatch_component_ids',
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, patch };
}

// ============================================================================
// Pure apply helpers (inputs never mutated)
// ============================================================================

function cloneComponent(c: MealComponent): MealComponent {
  return {
    ...c,
    macros: { ...c.macros },
    ...(c.measures ? { measures: c.measures.map((m) => ({ ...m })) } : {}),
    ...(c.display_snapshot ? { display_snapshot: { ...c.display_snapshot } } : {}),
    ...(c.nutrition_snapshot
      ? {
          nutrition_snapshot: {
            ...c.nutrition_snapshot,
            per_serving: c.nutrition_snapshot.per_serving
              ? {
                  calories: c.nutrition_snapshot.per_serving.calories,
                  macros: { ...c.nutrition_snapshot.per_serving.macros },
                }
              : null,
          },
        }
      : {}),
  };
}

/**
 * Apply the trusted, server-resolved grounding onto a component clone. Copies
 * the food's canonical nutrition (per_serving basis) and stamps a matched
 * grounding. needs_review is cleared here optimistically; the subsequent
 * deterministic recompute reconciles it (re-flagging when the component still
 * can't be safely scaled, e.g. no quantity/unit).
 */
function applyGrounding(component: MealComponent, food: ResolvedGroundingFood): void {
  applyGroundingToComponentInPlace(component, food);
}

/** Pure clone + apply trusted grounding for client-side composer flows. */
// applyGroundingToComponent exported from ./componentGrounding

/**
 * P14: clear a component's food grounding IN PLACE (on a clone). Drops the
 * canonical nutrition copied from the FoodObject (it is no longer valid) and
 * stamps a conservative ungrounded / user-entered state with needs_review. The
 * USEFUL display fields (name / raw_text / quantity / unit / preparation_note)
 * are deliberately preserved — clearing a match never deletes the component.
 */
function clearGrounding(component: MealComponent): void {
  component.food_object_id = null;
  component.match_status = 'none';
  component.source_kind = 'user_entered';
  component.calories = null;
  component.macros = { protein_g: null, carbs_g: null, fat_g: null };
  component.serving_size_g = undefined;
  component.measures = undefined;
  component.quantity_g = undefined;
  component.needs_review = true;
}

/**
 * P14: build a NEW component from an add patch. Conservative by default:
 * ungrounded, no invented nutrition, needs_review = true. When `food_object_id`
 * resolves to a trusted food the grounding is applied (nutrition copied);
 * the subsequent deterministic recompute reconciles needs_review.
 */
function buildAddedComponent(
  componentId: string,
  add: MealComponentAddPatch,
  resolvedFoods: Map<string, ResolvedGroundingFood> | undefined,
  errors: string[],
): MealComponent {
  const component: MealComponent = {
    component_id: componentId,
    name: add.name,
    raw_text: add.raw_text ?? null,
    preparation_note: add.preparation_note ?? null,
    quantity: add.quantity ?? null,
    unit: add.unit ?? null,
    food_object_id: null,
    calories: null,
    macros: { protein_g: null, carbs_g: null, fat_g: null },
    nutrition_basis: 'per_serving',
    match_status: 'none',
    source_kind: 'user_entered',
    needs_review: true,
  };
  if (add.food_object_id !== undefined) {
    const food = resolvedFoods?.get(add.food_object_id);
    if (!food) {
      errors.push(
        `add_components: selected food "${add.food_object_id}" could not be resolved`,
      );
    } else {
      applyGrounding(component, food);
    }
  }
  return component;
}

/**
 * Generate a stable component id for a newly added component that collides with
 * neither existing ids nor ids already generated in this build. Deterministic
 * given the same `taken` set (so the pure build stays test-stable).
 */
function generateComponentId(taken: Set<string>): string {
  let n = 1;
  let candidate = `mc_${n}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `mc_${n}`;
  }
  taken.add(candidate);
  return candidate;
}

function applyComponentEdits(
  components: MealComponent[],
  edits: MealComponentEditPatch[] | undefined,
  resolvedFoods?: Map<string, ResolvedGroundingFood>,
): { components: MealComponent[]; errors: string[] } {
  if (!edits || edits.length === 0) {
    return { components: components.map(cloneComponent), errors: [] };
  }
  const errors: string[] = [];
  const byId = new Map(components.map((c) => [c.component_id, c]));
  for (const edit of edits) {
    if (!byId.has(edit.component_id)) {
      errors.push(`components: no component with id "${edit.component_id}"`);
    }
  }
  const editById = new Map(edits.map((e) => [e.component_id, e]));
  const next = components.map((c) => {
    const edit = editById.get(c.component_id);
    if (!edit) return cloneComponent(c);
    const merged = cloneComponent(c);
    // Grounding first, so explicit field edits below win over the food's
    // copied display values (e.g. the user can keep their own name/quantity).
    if (edit.food_object_id !== undefined) {
      const food = resolvedFoods?.get(edit.food_object_id);
      if (!food) {
        errors.push(
          `components: selected food "${edit.food_object_id}" could not be resolved`,
        );
      } else {
        applyGrounding(merged, food);
      }
    }
    if (edit.name !== undefined) merged.name = edit.name;
    if (edit.raw_text !== undefined) merged.raw_text = edit.raw_text;
    if (edit.quantity !== undefined) merged.quantity = edit.quantity;
    if (edit.unit !== undefined) merged.unit = edit.unit;
    if (edit.preparation_note !== undefined) merged.preparation_note = edit.preparation_note;
    if (edit.needs_review !== undefined) merged.needs_review = edit.needs_review;
    return merged;
  });
  return { components: next, errors };
}

/** Normalize replacement steps: sorted by step_number, renumbered 1..N. */
function applyStepEdits(steps: MealStepEditPatch[]): MealStep[] {
  return [...steps]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s, idx) => ({ step_number: idx + 1, instruction: s.instruction }));
}

/**
 * The document's effective per-serving yield, when a SAFE basis exists. Mirrors
 * the grouped-logging service: a positive recipe_yield_servings mirror, or a
 * confirmed positive yield. Returns null when no safe servings basis is known.
 */
function effectiveYieldServings(doc: {
  yield: MealYield | null;
  recipe_yield_servings: number | null;
}): number | null {
  if (isPositiveNumber(doc.recipe_yield_servings)) return doc.recipe_yield_servings;
  if (doc.yield && doc.yield.confirmed && isPositiveNumber(doc.yield.servings)) {
    return doc.yield.servings;
  }
  return null;
}

// ============================================================================
// buildEditedMealDocument — the pure core
// ============================================================================

/**
 * Apply a SAFE patch to a MealDocument, recompute nutrition deterministically
 * when safe, and resolve a conservative review_state. PURE: `current` and its
 * arrays are never mutated. Returns the full merged document to persist (the
 * write boundary re-validates + person-scopes it).
 */
export function buildEditedMealDocument(
  current: MealDocument,
  rawPatch: unknown,
  resolvedFoods?: Map<string, ResolvedGroundingFood>,
): BuildEditedMealDocumentOutcome {
  const parsed = parseMealDocumentEditPatch(rawPatch);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const patch = parsed.patch;

  // ----- Apply scalar metadata -----
  const next: MealDocument = {
    ...current,
    components: current.components.map(cloneComponent),
    ...(current.steps ? { steps: current.steps.map((s) => ({ ...s })) } : {}),
    yield: current.yield ? { ...current.yield } : null,
    per_serving: current.per_serving ? { ...current.per_serving, macros: { ...current.per_serving.macros } } : null,
    totals: current.totals ? { ...current.totals, macros: { ...current.totals.macros } } : null,
  };

  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.prep_notes !== undefined) next.prep_notes = patch.prep_notes;
  if (patch.serving_label !== undefined) next.serving_label = patch.serving_label;

  // ----- Yield (keep recipe_yield_servings and yield.servings in lockstep) -----
  if (patch.recipe_yield_servings !== undefined) {
    next.recipe_yield_servings = patch.recipe_yield_servings;
    if (patch.recipe_yield_servings != null) {
      next.yield = {
        servings: patch.recipe_yield_servings,
        yield_label: next.yield?.yield_label ?? null,
        confirmed: next.yield?.confirmed ?? false,
      };
    } else if (next.yield) {
      next.yield = { ...next.yield, servings: null };
    }
  }

  // ----- Steps (full replace when supplied) -----
  if (patch.steps !== undefined) {
    next.steps = applyStepEdits(patch.steps);
  }

  let recomputeTriggered = patch.recipe_yield_servings !== undefined;

  if (patch.set_components !== undefined) {
    next.components = patch.set_components.map(cloneComponent);
    recomputeTriggered = true;
  } else {
    // ----- Structural op id validation (P14) -----
    const removeIds = patch.remove_component_ids ?? [];
    const unmatchIds = patch.unmatch_component_ids ?? [];
    const currentIds = new Set(current.components.map((c) => c.component_id));
    const structuralErrors: string[] = [];

    for (const id of removeIds) {
      if (!currentIds.has(id)) {
        structuralErrors.push(`remove_component_ids: no component with id "${id}"`);
      }
    }
    for (const id of unmatchIds) {
      if (!currentIds.has(id)) {
        structuralErrors.push(`unmatch_component_ids: no component with id "${id}"`);
      }
    }
    // A component cannot be both removed and unmatched / edited in one patch.
    const removeSet = new Set(removeIds);
    for (const id of unmatchIds) {
      if (removeSet.has(id)) {
        structuralErrors.push(`component "${id}" cannot be both removed and unmatched`);
      }
    }
    for (const edit of patch.components ?? []) {
      if (removeSet.has(edit.component_id)) {
        structuralErrors.push(`component "${edit.component_id}" cannot be both edited and removed`);
      }
    }
    if (structuralErrors.length > 0) return { ok: false, errors: structuralErrors };

    // ----- Components (P12 field edits + P13 grounding via resolved foods) -----
    const applied = applyComponentEdits(next.components, patch.components, resolvedFoods);
    if (applied.errors.length > 0) return { ok: false, errors: applied.errors };
    next.components = applied.components;

    // ----- P14: unmatch (clear grounding) before remove/add -----
    const unmatchSet = new Set(unmatchIds);
    if (unmatchSet.size > 0) {
      next.components = next.components.map((c) => {
        if (!unmatchSet.has(c.component_id)) return c;
        const cleared = cloneComponent(c);
        clearGrounding(cleared);
        return cleared;
      });
    }

    // ----- P14: remove -----
    if (removeSet.size > 0) {
      next.components = next.components.filter((c) => !removeSet.has(c.component_id));
    }

    // ----- P14: add (append conservative, optionally grounded components) -----
    const addErrors: string[] = [];
    if (patch.add_components && patch.add_components.length > 0) {
      const taken = new Set(next.components.map((c) => c.component_id));
      for (const add of patch.add_components) {
        const id = generateComponentId(taken);
        next.components.push(buildAddedComponent(id, add, resolvedFoods, addErrors));
      }
    }
    if (addErrors.length > 0) return { ok: false, errors: addErrors };

    const structuralChange =
      (patch.add_components?.length ?? 0) > 0 ||
      removeIds.length > 0 ||
      unmatchIds.length > 0;
    recomputeTriggered =
      recomputeTriggered ||
      patch.components !== undefined ||
      structuralChange;
  }

  // Final guard: component ids must be unique in the persisted document.
  const finalIds = next.components.map((c) => c.component_id);
  if (new Set(finalIds).size !== finalIds.length) {
    return { ok: false, errors: ['components: duplicate component_id in final document'] };
  }

  // ----- Deterministic recompute (only when nutrition-affecting fields changed) -----

  let recomputed = false;
  if (recomputeTriggered) {
    const result = recomputeMealNutrition(next.components);
    // Always adopt the review-reconciled component flags (never invents numbers;
    // ungrounded components are flagged, recomputable ones cleared).
    next.components = result.components.map((r) => r.component);

    const safe = !result.needs_review && hasNutritionValues(result.totals);
    if (safe) {
      next.totals = result.totals;
      const y = effectiveYieldServings(next);
      if (y != null) {
        next.per_serving = scaleMealNutrition(result.totals, 1 / y);
      } else if (next.yield == null && next.recipe_yield_servings == null) {
        // No yield concept (single-serving assembled meal): totals ARE per-serving.
        next.per_serving = { calories: result.totals.calories, macros: { ...result.totals.macros } };
      }
      // else: recipe without a positive yield — keep existing per_serving (cannot
      // derive safely); totals (batch) are still updated.
      recomputed = true;
    }
    // When NOT safe: preserve existing per_serving/totals verbatim (no invention).
  }

  // ----- Conservative review_state resolution -----
  const anyComponentNeedsReview = next.components.some((c) => c.needs_review);
  // A document with NO components (e.g. its last component was removed) cannot
  // be trusted/confirmed: the data model permits zero components, but we force
  // needs_review rather than block the removal.
  const documentEmpty = next.components.length === 0;
  const forceNeedsReview = anyComponentNeedsReview || documentEmpty;
  const requested = patch.review_state ?? current.review_state;

  let review_state_downgraded = false;
  let finalState: MealReviewState;

  if (forceNeedsReview) {
    // Any needs_review (or zero) component forces the document to needs_review.
    finalState = 'needs_review';
    if (requested === 'confirmed') review_state_downgraded = true;
  } else if (requested === 'confirmed') {
    const yieldOkForRecipe =
      next.kind !== 'recipe' || effectiveYieldServings(next) != null;
    const hasBasis = hasNutritionValues(next.per_serving) || hasNutritionValues(next.totals);
    // If components changed, confirmation also requires a safe recompute.
    const recomputeOk = !recomputeTriggered || recomputed;
    if (yieldOkForRecipe && hasBasis && recomputeOk) {
      finalState = 'confirmed';
    } else {
      finalState = 'needs_review';
      review_state_downgraded = true;
    }
  } else {
    finalState = requested;
  }

  next.review_state = finalState;

  // When confirming, implicitly confirm a positive yield so downstream
  // per-serving derivation (which prefers confirmed yields) stays consistent.
  if (
    finalState === 'confirmed' &&
    next.yield &&
    isPositiveNumber(next.yield.servings) &&
    !next.yield.confirmed
  ) {
    next.yield = { ...next.yield, confirmed: true };
  }

  return {
    ok: true,
    value: { document: next, review_state_downgraded, recomputed },
  };
}

// ============================================================================
// applyMealDocumentEditForPerson — the write path
// ============================================================================

export interface ApplyMealDocumentEditResult {
  document: MealDocument;
  review_state_downgraded: boolean;
  recomputed: boolean;
}

/**
 * Load a person's MealDocument, apply a SAFE patch, and persist the updated
 * source document. Person scope is enforced on BOTH the load and the write
 * (updateMealDocumentForPerson re-validates + person-scopes). Performs NO
 * journal entry mutations — logged instances are untouched.
 *
 * @returns null when the document is missing / not owned by personId (→ 404).
 * @throws  MealDocumentEditValidationError when the patch is invalid (→ 400).
 */
export async function applyMealDocumentEditForPerson(
  personId: string,
  id: string,
  rawPatch: unknown,
): Promise<ApplyMealDocumentEditResult | null> {
  const current = await getMealDocumentForPerson(personId, id);
  if (!current) return null;

  // Parse up-front so we can resolve any selected foods (server-side lookup)
  // BEFORE the pure build. A grounding selection referencing a food that does
  // not exist is a 400, not a silent no-op.
  const parsed = parseMealDocumentEditPatch(rawPatch);
  if (!parsed.ok) throw new MealDocumentEditValidationError(parsed.errors);

  const resolvedFoods = await resolveGroundingFoods(parsed.patch);

  const built = buildEditedMealDocument(current, rawPatch, resolvedFoods);
  if (!built.ok) throw new MealDocumentEditValidationError(built.errors);

  const updated = await updateMealDocumentForPerson(personId, id, built.value.document);
  if (!updated) return null;

  return {
    document: updated,
    review_state_downgraded: built.value.review_state_downgraded,
    recomputed: built.value.recomputed,
  };
}

/**
 * Resolve the distinct `food_object_id`s referenced by component grounding
 * edits (P13 re-match) AND newly added components (P14 immediate grounding)
 * into trusted grounding via server-side `getFoodById` lookups. Throws a
 * MealDocumentEditValidationError (→ 400) when a selected food does not exist.
 * READ-ONLY: this never mutates the food catalog or the food search behavior.
 */
async function resolveGroundingFoods(
  patch: Pick<MealDocumentEditPatch, 'components' | 'add_components'>,
): Promise<Map<string, ResolvedGroundingFood>> {
  const resolved = new Map<string, ResolvedGroundingFood>();
  const requested = [
    ...(patch.components ?? []).map((c) => c.food_object_id),
    ...(patch.add_components ?? []).map((c) => c.food_object_id),
  ];

  const ids = Array.from(
    new Set(
      requested.filter((fid): fid is string => typeof fid === 'string' && fid.length > 0),
    ),
  );
  if (ids.length === 0) return resolved;

  for (const fid of ids) {
    const food = await getFoodById(fid);
    if (!food) {
      throw new MealDocumentEditValidationError([
        `components: selected food "${fid}" was not found`,
      ]);
    }
    resolved.set(fid, foodObjectToGrounding(food));
  }
  return resolved;
}
