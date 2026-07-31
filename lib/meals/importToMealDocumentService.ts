/**
 * Meal Object Foundation — Packet 4: Import → MealDocument Service
 *
 * Converts a reviewed/parsed `imported_meals` draft into a canonical
 * MealDocument (lib/meals/types.ts) and persists it to meal_documents
 * (person-scoped). Two write paths:
 *
 *   - saveImportedMealAsMealDocumentDraft  — save as draft / needs_review.
 *       NEVER produces a `confirmed` recipe. Yield is left unconfirmed.
 *   - confirmImportedMealYieldAndSave      — the explicit yield-confirm gate.
 *       Requires a valid, caller-supplied yield. A recipe cannot become a
 *       confirmed reusable library object without this step.
 *
 * REQUIRED YIELD BEHAVIOR (decision #4):
 *   - Imported recipes do NOT become confirmed reusable records until yield is
 *     explicitly confirmed by the caller.
 *   - Missing/uncertain yield ⇒ draft (or needs_review) only.
 *   - A confirmed MealDocument of kind='recipe' always carries confirmed
 *     recipe_yield_servings + yield.confirmed === true.
 *   - Yield is never inferred and never silently confirmed.
 *
 * NUTRITION POLICY (decisions #7–#10, audit §5):
 *   - The P1 adapter maps imported ingredients (+ ingredient_match_json
 *     grounding) onto MealComponent, preserving raw/normalized names, match
 *     status, source kind, and per-serving estimates. Match/review metadata is
 *     carried through verbatim — nothing is invented.
 *   - The deterministic P3 recompute service is applied ONLY when every
 *     component is grounded and computable; its recomputed totals are then
 *     adopted. Otherwise the imported per-serving estimate is preserved and the
 *     document is surfaced as needs_review rather than fabricating numbers.
 *
 * SCOPE / SAFETY:
 *   - Server-only. Person scope is enforced by loading the imported meal via
 *     `getImportedMeal(personId, id)` (filters person_id) and by stamping the
 *     owner on every meal_documents write.
 *   - Does NOT touch saved-meal apply, planned-meal execution, grouped journal
 *     writes, log rendering, or branded food search.
 */

import { getImportedMeal } from '@/lib/plans/importsServerService';
import type { ImportedMeal } from '@/lib/plans/types';

import { importedMealToMealDocumentDraft } from './adapters';
import {
  createMealDocumentForPerson,
  findMealDocumentBySourceImportedMeal,
  updateMealDocumentForPerson,
} from './mealDocumentServerService';
import { normalizeSourceUrl } from './provenance';
import { withDerivedNutritionStatus } from './nutritionStatus';
import { recomputeMealDocumentNutrition } from './recompute';
import type { MealDocument, MealYield } from './types';

// ============================================================================
// Errors
// ============================================================================

/** Thrown when an imported meal cannot be found for this person. */
export class ImportedMealNotFoundError extends Error {
  constructor(importedMealId: string) {
    super(`Imported meal not found: ${importedMealId}`);
    this.name = 'ImportedMealNotFoundError';
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, ImportedMealNotFoundError.prototype);
  }
}

/**
 * Thrown when a confirm-yield request omits a valid yield. Confirmation never
 * infers yield — the caller must supply explicit serving information.
 */
export class MealYieldConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealYieldConfirmationError';
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, MealYieldConfirmationError.prototype);
  }
}

// ============================================================================
// Yield input
// ============================================================================

/** Caller-supplied yield used by the confirm path. `servings` is required. */
export interface YieldConfirmationInput {
  /** Total servings the prepared batch produces. Must be a finite number > 0. */
  servings: number;
  /** Optional human label of the batch unit (e.g. "2 loaves"). */
  yield_label?: string | null;
  /** Optional per-serving label (e.g. "per bowl"). */
  serving_label?: string | null;
}

function isValidServings(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// ============================================================================
// Internal: build + condition the canonical document
// ============================================================================

/**
 * Run the deterministic P3 recompute and adopt its totals ONLY when every
 * component was safely recomputed (fully grounded + computable). Otherwise
 * return the document untouched so the imported per-serving estimate and the
 * per-component review flags are preserved and no nutrition is invented.
 */
function applyRecomputeWhereSafe(doc: MealDocument): MealDocument {
  if (doc.components.length === 0) return doc;

  const { document, recompute } = recomputeMealDocumentNutrition(doc);
  const fullyComputable =
    !recompute.needs_review &&
    recompute.recomputed_count === doc.components.length;

  // When fully computable, adopt the recomputed totals + reconciled components.
  // When not, keep the adapter's document (estimate + match metadata intact).
  return fullyComputable ? document : doc;
}

/**
 * Build the canonical draft document for an imported meal: P1 adapter →
 * provenance enrichment → recompute-where-safe. The resulting document has a
 * null `id` (it is a NEW meal_documents row, distinct from the imported_meal)
 * and is owned by `personId`.
 */
function buildBaseDocument(
  imported: ImportedMeal,
  personId: string,
): MealDocument {
  const adapted = importedMealToMealDocumentDraft(imported);

  const durableUrl =
    normalizeSourceUrl(imported.source_url) ?? imported.source_url ?? null;

  const withProvenance: MealDocument = {
    ...adapted,
    id: null,
    person_id: personId,
    lifecycle_state: 'active',
    archived_at: null,
    source: {
      ...adapted.source,
      source_type: 'imported',
      source_imported_meal_id: imported.id,
      source_url: durableUrl,
      import_type: imported.import_type ?? null,
      source_platform: imported.source_platform ?? null,
      raw_input_text: imported.raw_input_text ?? null,
    },
  };

  return withDerivedNutritionStatus(applyRecomputeWhereSafe(withProvenance));
}

/** True when any component still needs review (ungrounded/ambiguous nutrition). */
function anyComponentNeedsReview(doc: MealDocument): boolean {
  return doc.components.some((c) => c.needs_review);
}

/**
 * Persist a prepared document, keeping import→document writes idempotent: if
 * this person already has a document derived from the same imported meal, that
 * row is updated; otherwise a new row is created.
 */
async function upsertImportedDocument(
  personId: string,
  imported: ImportedMeal,
  doc: MealDocument,
): Promise<MealDocument> {
  const existing = await findMealDocumentBySourceImportedMeal(personId, imported.id);
  if (existing && existing.id) {
    const updated = await updateMealDocumentForPerson(personId, existing.id, doc);
    if (updated) return updated;
  }
  return createMealDocumentForPerson(personId, doc);
}

async function loadOwnedImportedMeal(
  personId: string,
  importedMealId: string,
): Promise<ImportedMeal> {
  const imported = await getImportedMeal(personId, importedMealId);
  if (!imported) throw new ImportedMealNotFoundError(importedMealId);
  return imported;
}

// ============================================================================
// Public: save as draft
// ============================================================================

/**
 * Convert an imported meal into a canonical MealDocument and save it as a
 * draft / needs_review record. NEVER confirms yield and NEVER produces a
 * `confirmed` document — that requires confirmImportedMealYieldAndSave.
 *
 * Person scope: the imported meal is loaded with `getImportedMeal(personId,…)`
 * (404 for non-owners) and the document is owned by `personId` on write.
 */
export async function saveImportedMealAsMealDocumentDraft(
  personId: string,
  importedMealId: string,
): Promise<MealDocument> {
  const imported = await loadOwnedImportedMeal(personId, importedMealId);
  const base = buildBaseDocument(imported, personId);

  // Never confirmed on the draft path. Downgrade to needs_review when any
  // component is ungrounded/ambiguous; otherwise keep the adapter's draft
  // review state (draft | needs_review) but never 'confirmed'.
  const review_state: MealDocument['review_state'] = anyComponentNeedsReview(base)
    ? 'needs_review'
    : base.review_state === 'confirmed'
      ? 'draft'
      : base.review_state;

  const draft: MealDocument = {
    ...base,
    review_state,
    // Yield stays unconfirmed on the draft path.
    yield: base.yield ? { ...base.yield, confirmed: false } : base.yield,
  };

  return upsertImportedDocument(personId, imported, draft);
}

// ============================================================================
// Public: confirm yield + save
// ============================================================================

export interface ConfirmYieldResult {
  document: MealDocument;
  /**
   * True when the document was saved as `confirmed`. False when yield was
   * confirmed but the document was held at `needs_review` because some
   * components remain ungrounded/ambiguous (nutrition was NOT invented).
   */
  confirmed: boolean;
}

/**
 * The explicit yield-confirmation gate. Requires a valid, caller-supplied
 * yield (servings > 0) — yield is never inferred. Sets recipe_yield_servings,
 * serving_label, and the canonical yield object (confirmed = true), then saves.
 *
 * Review state after confirm:
 *   - 'confirmed'    when no component needs review (fully grounded).
 *   - 'needs_review' when any component is ungrounded/ambiguous — the yield is
 *     still recorded as confirmed, but the document is not promoted to a
 *     trusted library object and no nutrition is fabricated.
 *
 * A confirmed kind='recipe' document therefore always carries confirmed yield.
 *
 * @throws MealYieldConfirmationError when `yieldInput.servings` is missing/invalid.
 * @throws ImportedMealNotFoundError  when the import is not owned by personId.
 */
export async function confirmImportedMealYieldAndSave(
  personId: string,
  importedMealId: string,
  yieldInput: YieldConfirmationInput,
): Promise<ConfirmYieldResult> {
  if (!yieldInput || !isValidServings(yieldInput.servings)) {
    throw new MealYieldConfirmationError(
      'Yield confirmation requires an explicit servings value greater than 0. Yield is never inferred.',
    );
  }

  const imported = await loadOwnedImportedMeal(personId, importedMealId);
  const base = buildBaseDocument(imported, personId);

  const confirmedYield: MealYield = {
    servings: yieldInput.servings,
    yield_label:
      yieldInput.yield_label != null
        ? yieldInput.yield_label
        : base.yield?.yield_label ?? null,
    confirmed: true,
  };

  const componentsNeedReview = anyComponentNeedsReview(base);
  const review_state: MealDocument['review_state'] = componentsNeedReview
    ? 'needs_review'
    : 'confirmed';

  const doc: MealDocument = {
    ...base,
    yield: confirmedYield,
    recipe_yield_servings: yieldInput.servings,
    serving_label:
      yieldInput.serving_label != null ? yieldInput.serving_label : base.serving_label,
    review_state,
  };

  const saved = await upsertImportedDocument(personId, imported, doc);
  return { document: saved, confirmed: saved.review_state === 'confirmed' };
}
