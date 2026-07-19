/**
 * Meal Object Foundation — Packet 5: Grouped Meal Logging Write Path
 *
 * Logs a canonical MealDocument as EXACTLY ONE journal_entries intake row whose
 * payload carries a `meal_group`. This satisfies the core product rule:
 *
 *   When a meal is added to the log it appears as a first-level meal entry —
 *   NOT as a pile of individual ingredient entries.
 *
 * The grouped entry stays back-compatible: its top-level
 * `name`/`quantity`/`unit`/`calories`/`macros` mirror the logged amount so the
 * existing day view, LoggedItemCard, and daily NDS math keep reading them
 * unchanged, while the full component/instruction snapshot rides along under
 * `payload.meal_group` for a future (not-this-packet) grouped log renderer.
 *
 * SCOPE / SAFETY (P5):
 *   - Person scope is enforced: the MealDocument is loaded with
 *     `getMealDocumentForPerson(personId, id)` (filters person_id; non-owned /
 *     missing ⇒ MealDocumentNotFoundError → 404) and the journal entry is
 *     created with the SAME authenticated personId. Request bodies never supply
 *     person identity.
 *   - The source MealDocument is NEVER mutated: components/steps are snapshotted
 *     into fresh objects, the load is read-only, and the write only INSERTs a
 *     journal entry.
 *   - Nutrition is deterministic, no AI / no food search / no network. Top-level
 *     nutrition is scaled from the document's trusted per-serving nutrition (or
 *     a safe per-serving basis derived from confirmed yield). Needs-review or
 *     unknown nutrition is NEVER invented — top-level numbers are simply omitted.
 *   - Does NOT touch flat food logging, saved-meal apply, planned-meal
 *     execution, branded food search, or any log rendering.
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§3.4 logged meal
 * instance, §5 recompute policy) + the P5 packet brief.
 *
 * NOTE: This module is SERVER-ONLY (imports journalServerService/Supabase at
 * module load). The pure, client-safe validation/payload-building logic lives
 * in ./groupedMealPayload.ts and is re-exported below for existing importers —
 * import from there directly in any code that ships to the browser (e.g. the
 * shared Meal Composer's submission builders).
 */

import {
  createEntry,
  type JournalEntry,
  type JournalEntryPayload,
} from '@/lib/journal/journalServerService';

import { getMealDocumentForPerson } from './mealDocumentServerService';
import {
  buildGroupedMealIntakePayload,
  GroupedMealLogValidationError,
  scaleTopLevelMealNutrition,
  validateGroupedMealLogInput,
  type BuildGroupedMealPayloadOptions,
  type GroupedMealLogInput,
  type GroupedMealLogValidation,
  type ValidatedGroupedMealLog,
} from './groupedMealPayload';

// Re-exported so existing importers (and tests) keep resolving these here.
// The canonical implementations now live in ./groupedMealPayload (client-safe)
// and ./recompute (scaleTopLevelMealNutrition, shared with AddToLogPanel).
export {
  buildGroupedMealIntakePayload,
  GroupedMealLogValidationError,
  scaleTopLevelMealNutrition,
  validateGroupedMealLogInput,
};
export type {
  BuildGroupedMealPayloadOptions,
  GroupedMealLogInput,
  GroupedMealLogValidation,
  ValidatedGroupedMealLog,
};

// ============================================================================
// Errors
// ============================================================================

/** Thrown when a MealDocument cannot be found for this person (caller → 404). */
export class MealDocumentNotFoundError extends Error {
  constructor(mealDocumentId: string) {
    super(`Meal document not found: ${mealDocumentId}`);
    this.name = 'MealDocumentNotFoundError';
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, MealDocumentNotFoundError.prototype);
  }
}

// ============================================================================
// logMealDocumentForPerson — the write path
// ============================================================================

/**
 * Log a person's MealDocument as EXACTLY ONE grouped journal intake entry.
 *
 * Person scope: the document is loaded with `getMealDocumentForPerson(personId,
 * id)` (404 for non-owners/missing) and the journal entry is created with the
 * SAME personId. The source document is never mutated.
 *
 * Exactly-one guarantee: this function issues a SINGLE `createEntry` call. No
 * per-component / per-ingredient rows are ever created.
 *
 * @throws GroupedMealLogValidationError when the input is invalid.
 * @throws MealDocumentNotFoundError      when the document is not owned by personId.
 */
export async function logMealDocumentForPerson(
  personId: string,
  mealDocumentId: string,
  input?: GroupedMealLogInput,
): Promise<JournalEntry> {
  const validated = validateGroupedMealLogInput(input);
  if (!validated.ok) throw new GroupedMealLogValidationError(validated.errors);
  const { consumed_servings, occurredAt, note } = validated.value;

  const document = await getMealDocumentForPerson(personId, mealDocumentId);
  if (!document) throw new MealDocumentNotFoundError(mealDocumentId);

  const payload = buildGroupedMealIntakePayload(document, {
    consumed_servings,
    instance_note: note,
  });

  return createEntry({
    personId,
    entryType: 'intake',
    occurredAt,
    payload: payload as JournalEntryPayload,
  });
}
