/**
 * Meal Object Foundation — Packet 2: Storage validation helpers (unused)
 *
 * Pure, server-safe validators that future write boundaries (Meal Library
 * create/update; grouped logging) can use to validate canonical objects before
 * they touch storage. They mirror the persistence shapes codified in:
 *   - scripts/sql/createMealDocuments.sql        (meal_documents row)
 *   - scripts/sql/codifyJournalMealGroupPayload  (journal payload.meal_group)
 *
 * SCOPE / SAFETY (Packet 2):
 *   - NOT wired into any API, create/update path, or runtime behavior. They are
 *     additive and currently unused except by tests.
 *   - No I/O, no DB, no network, no AI, no nutrition recompute. Pure functions.
 *   - These never invent nutrition and never require NDS: a MealDocument with
 *     no NDS block validates fine (saved/manual meals legitimately lack NDS).
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§3, §11).
 */

import type { ZodError } from 'zod';

import {
  GroupedMealEntryPayloadSchema,
  LoggedMealGroupSchema,
  MealDocumentSchema,
} from './validators';
import type {
  GroupedMealEntryPayload,
  LoggedMealGroup,
  MealDocument,
} from './types';

// ============================================================================
// Result type
// ============================================================================

/** Discriminated validation result; mirrors the lightweight Plans pattern. */
export type MealValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function flattenZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

// ============================================================================
// meal_documents row projection
// ============================================================================

/**
 * The persisted shape of a public.meal_documents row. The denormalized columns
 * are search/filter projections of `document_json` (the source of truth).
 * Mirrors scripts/sql/createMealDocuments.sql exactly.
 */
export interface MealDocumentStorageRow {
  person_id: string;
  schema_version: number;
  kind: MealDocument['kind'];
  title: string;
  description: string | null;
  review_state: MealDocument['review_state'];
  intents: string[];
  source_type: string | null;
  source_id: string | null;
  source_url: string | null;
  document_json: MealDocument;
}

/**
 * Resolve the generic provenance pointer (`source_id`) from a MealDocument's
 * source block. Prefers the most specific id available, matching how the
 * Meal Library will want to trace a row back to its origin.
 */
function resolveSourceId(doc: MealDocument): string | null {
  const s = doc.source;
  return (
    s.source_imported_meal_id ??
    s.source_planned_meal_id ??
    s.source_template_id ??
    null
  );
}

/**
 * Project a canonical MealDocument into a meal_documents storage row. PURE:
 * does not write anything. `person_id` is supplied by the caller (the write
 * boundary) and overrides any value on the document so ownership is explicit.
 */
export function mealDocumentToStorageRow(
  doc: MealDocument,
  personId: string,
): MealDocumentStorageRow {
  return {
    person_id: personId,
    schema_version: doc.schema_version,
    kind: doc.kind,
    title: doc.title,
    description: doc.description ?? null,
    review_state: doc.review_state,
    intents: [...doc.intents],
    source_type: doc.source.source_type ?? null,
    source_id: resolveSourceId(doc),
    source_url: doc.source.source_url ?? null,
    document_json: { ...doc, person_id: personId },
  };
}

// ============================================================================
// validateMealDocumentForStorage
// ============================================================================

/**
 * Validate an unknown value as a storable MealDocument and, when valid, return
 * the meal_documents row projection. Enforces the storage invariants that the
 * DB CHECK constraints encode (non-empty title, schema_version >= 1, valid
 * kind/review_state) plus optional person-scope.
 *
 * Does NOT require NDS. A document whose `nds` is null is valid.
 */
export function validateMealDocumentForStorage(
  input: unknown,
  options?: { personId?: string },
): MealValidationResult<MealDocumentStorageRow> {
  const parsed = MealDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: flattenZodIssues(parsed.error) };
  }
  const doc = parsed.data as MealDocument;

  const errors: string[] = [];
  if (doc.title.trim().length === 0) {
    errors.push('title: must not be empty for storage');
  }
  if (!Number.isInteger(doc.schema_version) || doc.schema_version < 1) {
    errors.push('schema_version: must be an integer >= 1');
  }

  const personId = options?.personId;
  if (personId !== undefined) {
    if (personId.trim().length === 0) {
      errors.push('person_id: must not be empty');
    } else if (doc.person_id != null && doc.person_id !== personId) {
      errors.push(
        `person_id: document is scoped to ${doc.person_id}, not ${personId}`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Use the supplied owner when present; otherwise the document's own owner.
  const owner = personId ?? doc.person_id;
  if (owner == null || owner.trim().length === 0) {
    return {
      ok: false,
      errors: ['person_id: required for storage (pass options.personId or set document.person_id)'],
    };
  }

  return { ok: true, value: mealDocumentToStorageRow(doc, owner) };
}

// ============================================================================
// assertMealDocumentPersonScoped
// ============================================================================

/**
 * Throw unless `doc` is owned by `personId`. A document with a null
 * `person_id` (an unpersisted draft) is treated as adoptable and passes.
 * Useful at a write boundary to harden ownership before persistence.
 */
export function assertMealDocumentPersonScoped(
  doc: Pick<MealDocument, 'person_id'>,
  personId: string,
): void {
  if (personId == null || personId.trim().length === 0) {
    throw new Error('assertMealDocumentPersonScoped: personId is required');
  }
  if (doc.person_id != null && doc.person_id !== personId) {
    throw new Error(
      `assertMealDocumentPersonScoped: document is scoped to ${doc.person_id}, not ${personId}`,
    );
  }
}

// ============================================================================
// validateLoggedMealGroupPayload
// ============================================================================

/**
 * Validate the grouped-meal journal payload (GroupedMealEntryPayload). Accepts
 * the full intake payload whose optional `meal_group` is a LoggedMealGroup.
 *
 * A payload WITHOUT `meal_group` is valid: that is the legacy flat single-food
 * shape (absence ⇒ legacy behavior, per the codified contract). Use
 * `requireMealGroup: true` at boundaries that specifically build grouped meals.
 */
export function validateLoggedMealGroupPayload(
  input: unknown,
  options?: { requireMealGroup?: boolean },
): MealValidationResult<GroupedMealEntryPayload> {
  const parsed = GroupedMealEntryPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: flattenZodIssues(parsed.error) };
  }
  const payload = parsed.data as GroupedMealEntryPayload;

  if (options?.requireMealGroup && payload.meal_group == null) {
    return { ok: false, errors: ['meal_group: required but absent'] };
  }

  return { ok: true, value: payload };
}

/**
 * Validate a bare LoggedMealGroup (e.g. the `meal_group` sub-object on its
 * own). PURE; no side effects.
 */
export function validateLoggedMealGroup(
  input: unknown,
): MealValidationResult<LoggedMealGroup> {
  const parsed = LoggedMealGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: flattenZodIssues(parsed.error) };
  }
  return { ok: true, value: parsed.data as LoggedMealGroup };
}
