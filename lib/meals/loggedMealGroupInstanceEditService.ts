/**
 * Meal Object Foundation — Packet 16: Logged Grouped Meal Instance Edit Service
 *
 * Person-scoped, SAFE editing of a LOGGED grouped meal journal entry instance —
 * the log-side equivalent of the source MealDocument editor (P12–P14), but the
 * mutation target is the journal entry snapshot (journal_entries.payload +
 * payload.meal_group), NEVER the reusable source MealDocument.
 *
 * CORE PRODUCT RULE — a logged meal is historical truth for what the user ate.
 * Editing a logged grouped meal:
 *   - changes ONLY that journal entry payload,
 *   - marks the instance detached from its source
 *       (payload.meal_group.detached_from_source = true), and
 *   - leaves the source MealDocument completely unchanged (this module never
 *     reads or writes meal_documents).
 *
 * SCOPE / SAFETY (P16 MVP):
 *   - The SAFE editable surface for the logged instance is intentionally small:
 *       • meal display name        (payload.name + meal_group.name)
 *       • consumed servings        (payload.quantity + meal_group.consumed_servings)
 *       • instance note            (meal_group.instance_notes)
 *     Component-level instance editing is deferred (the P14 structural model can
 *     be layered on later without changing this contract).
 *   - Top-level nutrition stays an ABSOLUTE consumed total (P10 daily-totals
 *     semantics): meal_group.totals stores the already-consumed nutrition at the
 *     stored consumed_servings, so changing servings re-scales it deterministically
 *     (totals × new/old). Top-level payload.calories/macros mirror that total.
 *   - Nutrition is NEVER invented. When servings change but the prior totals /
 *     servings basis is not safe to scale, the current top-level nutrition is
 *     PRESERVED verbatim and the instance is marked needs_review = true.
 *   - PURE builder: inputs are never mutated. Person scope + persistence are
 *     enforced at the write boundary (applyGroupedMealInstanceEditForPerson via
 *     getEntry/updateEntry, both filtered by person_id). No AI, no food search,
 *     no network, no MealDocument access.
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§3.4 logged meal
 * instance, §5 recompute policy) + the P16 packet brief.
 */

import {
  getEntry,
  updateEntry,
  type JournalEntry,
  type JournalEntryPayload,
} from '@/lib/journal/journalServerService';

import { macrosToJournal } from './adapters';
import { hasMealGroupPayload } from './loggedMealGroup';
import { scaleMealNutrition } from './recompute';
import type {
  CanonicalMacros,
  GroupedMealEntryPayload,
  LoggedMealGroup,
  MealNutrition,
} from './types';

// ============================================================================
// Errors
// ============================================================================

/** Thrown when an instance edit patch is invalid (caller → 400). */
export class LoggedMealInstanceEditValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Invalid logged meal edit: ${errors.join('; ')}`);
    this.name = 'LoggedMealInstanceEditValidationError';
    this.errors = errors;
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, LoggedMealInstanceEditValidationError.prototype);
  }
}

// ============================================================================
// Patch input (the SAFE editable surface for a logged instance)
// ============================================================================

/** The small, safe patch surface accepted for a logged grouped meal instance. */
export interface LoggedMealInstanceEditPatch {
  /** Meal display name (mirrors to payload.name + meal_group.name). */
  name?: string;
  /** Servings actually eaten. Finite > 0. Re-scales top-level nutrition. */
  consumed_servings?: number;
  /** Per-instance note. null clears it. */
  instance_note?: string | null;
}

export interface BuildEditedGroupedMealResult {
  payload: GroupedMealEntryPayload & { meal_group: LoggedMealGroup };
  /** True when top-level nutrition was deterministically re-scaled. */
  recomputed: boolean;
  /** Final review flag of the logged instance after the edit. */
  needs_review: boolean;
  /** Always true — any instance edit detaches it from its source. */
  detached_from_source: true;
}

export type BuildEditedGroupedMealOutcome =
  | { ok: true; value: BuildEditedGroupedMealResult }
  | { ok: false; errors: string[] };

// ============================================================================
// Validation
// ============================================================================

const MAX_NAME = 200;
const MAX_NOTE = 500;

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
 * Parse + type-validate an unknown patch into a typed instance edit patch.
 * Unknown/unsafe fields (e.g. person_id, detached_from_source, totals,
 * components) are IGNORED — never trusted from the request body. Known fields
 * with the wrong type/shape are reported as errors. At least one editable field
 * must be present.
 */
export function parseLoggedMealInstanceEditPatch(
  input: unknown,
):
  | { ok: true; patch: LoggedMealInstanceEditPatch }
  | { ok: false; errors: string[] } {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['patch must be an object'] };
  }
  const errors: string[] = [];
  const patch: LoggedMealInstanceEditPatch = {};

  if ('name' in input) {
    const v = input.name;
    if (typeof v !== 'string') {
      errors.push('name must be a string');
    } else if (v.trim().length === 0) {
      errors.push('name must not be empty');
    } else if (v.length > MAX_NAME) {
      errors.push(`name must be ${MAX_NAME} characters or fewer`);
    } else {
      patch.name = v;
    }
  }

  if ('consumed_servings' in input) {
    const v = input.consumed_servings;
    if (!isPositiveNumber(v)) {
      errors.push('consumed_servings must be a finite number greater than 0');
    } else {
      patch.consumed_servings = v;
    }
  }

  if ('instance_note' in input) {
    const v = input.instance_note;
    if (v === null) {
      patch.instance_note = null;
    } else if (typeof v !== 'string') {
      errors.push('instance_note must be a string or null');
    } else if (v.length > MAX_NOTE) {
      errors.push(`instance_note must be ${MAX_NOTE} characters or fewer`);
    } else {
      const trimmed = v.trim();
      patch.instance_note = trimmed.length > 0 ? trimmed : null;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  if (
    patch.name === undefined &&
    patch.consumed_servings === undefined &&
    patch.instance_note === undefined
  ) {
    return { ok: false, errors: ['no editable fields provided'] };
  }

  return { ok: true, patch };
}

// ============================================================================
// Pure clone helpers (inputs never mutated)
// ============================================================================

function cloneMacros(macros: CanonicalMacros): CanonicalMacros {
  const out: CanonicalMacros = {
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
  };
  if (macros.fiber_g !== undefined) out.fiber_g = macros.fiber_g;
  if (macros.added_sugar_g !== undefined) out.added_sugar_g = macros.added_sugar_g;
  return out;
}

function cloneNutrition(n: MealNutrition): MealNutrition {
  return { calories: n.calories, macros: cloneMacros(n.macros) };
}

// ============================================================================
// buildEditedGroupedMealPayload — the pure core
// ============================================================================

/**
 * Apply a SAFE patch to a logged grouped meal payload. PURE: `current` is never
 * mutated. The returned payload:
 *   - mirrors name to payload.name + meal_group.name,
 *   - sets meal_group.consumed_servings + payload.quantity to the new servings,
 *   - re-scales top-level nutrition (payload.calories/macros + meal_group.totals)
 *     deterministically when servings change AND the prior totals/servings basis
 *     is safe; otherwise PRESERVES top-level nutrition and flags needs_review,
 *   - sets meal_group.instance_notes from the patch,
 *   - ALWAYS sets meal_group.detached_from_source = true.
 *
 * The source MealDocument is never read or written here.
 */
export function buildEditedGroupedMealPayload(
  current: GroupedMealEntryPayload & { meal_group: LoggedMealGroup },
  rawPatch: unknown,
): BuildEditedGroupedMealOutcome {
  const parsed = parseLoggedMealInstanceEditPatch(rawPatch);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const patch = parsed.patch;

  const currentGroup = current.meal_group;

  // Clone the group (components/steps are not edited in the MVP, so referencing
  // the existing arrays is safe — they are never mutated in place).
  const group: LoggedMealGroup = {
    ...currentGroup,
    totals: cloneNutrition(currentGroup.totals),
  };
  const payload: GroupedMealEntryPayload & { meal_group: LoggedMealGroup } = {
    ...current,
    meal_group: group,
  };

  // ----- Name -----
  if (patch.name !== undefined) {
    payload.name = patch.name;
    group.name = patch.name;
  }

  // ----- Instance note -----
  if (patch.instance_note !== undefined) {
    group.instance_notes = patch.instance_note;
  }

  // ----- Consumed servings + deterministic nutrition re-scale -----
  let recomputed = false;
  let needsReview = group.needs_review === true;

  if (patch.consumed_servings !== undefined) {
    const oldServings = currentGroup.consumed_servings;
    const newServings = patch.consumed_servings;

    group.consumed_servings = newServings;
    payload.quantity = newServings;

    if (newServings !== oldServings) {
      const canScale =
        isPositiveNumber(oldServings) && hasNutritionValues(currentGroup.totals);

      if (canScale) {
        const factor = newServings / oldServings;
        const scaled = scaleMealNutrition(currentGroup.totals, factor);
        group.totals = scaled;
        applyTopLevelNutrition(payload, scaled);
        recomputed = true;
        // Scaling servings does not resolve component grounding review state;
        // preserve the instance's existing needs_review flag.
      } else {
        // Unsafe to re-scale: preserve current top-level nutrition verbatim and
        // surface the instance for review (never invent nutrition).
        needsReview = true;
        group.needs_review = true;
      }
    }
  }

  group.detached_from_source = true;

  return {
    ok: true,
    value: {
      payload,
      recomputed,
      needs_review: needsReview,
      detached_from_source: true,
    },
  };
}

/**
 * Write the (already-consumed, absolute) top-level nutrition mirror onto the
 * payload from a canonical nutrition block. Removes the keys when a value is
 * unknown so the top level never carries a stale/invented number.
 */
function applyTopLevelNutrition(
  payload: GroupedMealEntryPayload,
  nutrition: MealNutrition,
): void {
  if (nutrition.calories != null) {
    payload.calories = nutrition.calories;
  } else {
    delete payload.calories;
  }

  const journalMacros = macrosToJournal(nutrition.macros);
  if (Object.keys(journalMacros).length > 0) {
    payload.macros = journalMacros;
  } else {
    delete payload.macros;
  }
}

// ============================================================================
// applyGroupedMealInstanceEditForPerson — the write path
// ============================================================================

export type ApplyGroupedMealInstanceEditResult =
  | { status: 'not_found' }
  | { status: 'not_grouped' }
  | {
      status: 'ok';
      entry: JournalEntry;
      recomputed: boolean;
      needs_review: boolean;
      detached_from_source: true;
    };

/**
 * Load a person's journal entry, apply a SAFE instance edit, and persist ONLY
 * the journal entry payload. Person scope is enforced on BOTH the load
 * (getEntry filters person_id) and the write (updateEntry filters person_id).
 *
 * Performs NO MealDocument reads/writes — the reusable source document is left
 * unchanged. Returns a discriminated status so the route maps:
 *   - 'not_found'   → 404 (missing OR not owned by personId)
 *   - 'not_grouped' → 400 (intake entry without a meal_group, or non-intake)
 *
 * @throws LoggedMealInstanceEditValidationError when the patch is invalid (→ 400).
 */
export async function applyGroupedMealInstanceEditForPerson(
  personId: string,
  entryId: string,
  rawPatch: unknown,
): Promise<ApplyGroupedMealInstanceEditResult> {
  const entry = await getEntry(personId, entryId);
  if (!entry) return { status: 'not_found' };

  if (entry.type !== 'intake' || !hasMealGroupPayload(entry.payload)) {
    return { status: 'not_grouped' };
  }

  const built = buildEditedGroupedMealPayload(entry.payload, rawPatch);
  if (!built.ok) throw new LoggedMealInstanceEditValidationError(built.errors);

  const updated = await updateEntry({
    personId,
    entryId,
    payload: built.value.payload as JournalEntryPayload,
  });
  if (!updated) return { status: 'not_found' };

  return {
    status: 'ok',
    entry: updated,
    recomputed: built.value.recomputed,
    needs_review: built.value.needs_review,
    detached_from_source: true,
  };
}
