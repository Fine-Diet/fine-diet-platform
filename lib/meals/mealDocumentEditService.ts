/**
 * Meal Object Foundation — Packet 12: MealDocument Review / Edit Service
 *
 * Person-scoped, SAFE editing of a reusable canonical MealDocument. Editing a
 * library item changes the reusable SOURCE document going forward — it never
 * rewrites prior logged journal meal instances (those snapshot their own
 * payload.meal_group and remain historical truth). This module therefore makes
 * NO journal writes of any kind.
 *
 * SCOPE / SAFETY (P12):
 *   - Only a small, safe field surface can be patched (title, description, prep
 *     notes, serving label, recipe yield servings, review_state, and per-component
 *     display name / raw text / quantity / unit / preparation note / needs_review,
 *     plus step text/order). No grounding (food_object_id / match_status /
 *     source_kind) re-matching — that is a later packet.
 *   - Nutrition is recomputed DETERMINISTICALLY via the P3 service and ONLY when
 *     a nutrition-affecting field changed (components / yield) AND every component
 *     is safely recomputable. Otherwise existing per_serving/totals are preserved
 *     verbatim — nutrition is never invented and never silently zeroed.
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

import {
  recomputeMealNutrition,
  scaleMealNutrition,
} from './recompute';
import {
  getMealDocumentForPerson,
  updateMealDocumentForPerson,
} from './mealDocumentServerService';
import type {
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
}

/** Full replacement of a step (text + order). */
export interface MealStepEditPatch {
  step_number: number;
  instruction: string;
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
  };
}

function applyComponentEdits(
  components: MealComponent[],
  edits: MealComponentEditPatch[] | undefined,
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

  // ----- Components -----
  const applied = applyComponentEdits(next.components, patch.components);
  if (applied.errors.length > 0) return { ok: false, errors: applied.errors };
  next.components = applied.components;

  // ----- Deterministic recompute (only when nutrition-affecting fields changed) -----
  const recomputeTriggered =
    patch.components !== undefined || patch.recipe_yield_servings !== undefined;

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
  const requested = patch.review_state ?? current.review_state;

  let review_state_downgraded = false;
  let finalState: MealReviewState;

  if (anyComponentNeedsReview) {
    // Any needs_review component forces the whole document to needs_review.
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

  const built = buildEditedMealDocument(current, rawPatch);
  if (!built.ok) throw new MealDocumentEditValidationError(built.errors);

  const updated = await updateMealDocumentForPerson(personId, id, built.value.document);
  if (!updated) return null;

  return {
    document: updated,
    review_state_downgraded: built.value.review_state_downgraded,
    recomputed: built.value.recomputed,
  };
}
