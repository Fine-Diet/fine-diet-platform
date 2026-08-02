/**
 * Package 4 / 5B correction — server-side MealDocument → planned_meals attach gates.
 *
 * Plans store a pointer + planned servings; MealDocuments remain canonical
 * meal truth. New attachments of archived documents are rejected; existing
 * references remain readable via Package 3 GET-by-id.
 *
 * Package 5B founder-QA correction:
 * Reusable day-template / week-pattern snapshots may carry a stale
 * `source_meal_document_id` after a library document was deleted. Strict attach
 * remains unchanged for composer/manual writes. Snapshot instantiation may
 * clear only an invalid pointer when an embedded payload snapshot is present.
 */

import { getMealDocumentForPerson } from '@/lib/meals/mealDocumentServerService';
import type { MealDocument } from '@/lib/meals/types';
import { PlanRequestValidationError } from './planRequestErrors';
import {
  isMealDocumentArchived,
  readSourceMealDocumentId,
  stampPlannedMealDocumentPointer,
} from './mealDocumentPlanPointer';

export {
  isMealDocumentArchived,
  readSourceMealDocumentId,
  stampPlannedMealDocumentPointer,
} from './mealDocumentPlanPointer';

export const STALE_POINTER_COMPAT_NOTE =
  'Cleared invalid MealDocument pointer; embedded planned-meal payload preserved for reusable instantiation.';

/**
 * True when the payload carries enough embedded meal composition to instantiate
 * without resolving a live MealDocument pointer.
 *
 * Package 5B completeness guard: `meal_document_snapshot=true` alone is NOT
 * sufficient. Stale-pointer compatibility requires non-empty `typed_components`
 * or non-empty `items`.
 */
export function hasReusableEmbeddedMealSnapshot(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload) return false;
  const typed = payload.typed_components;
  if (Array.isArray(typed) && typed.length > 0) return true;
  const items = payload.items;
  if (Array.isArray(items) && items.length > 0) return true;
  return false;
}

/**
 * Clear only the invalid canonical pointer. Preserves items / typed_components
 * and other embedded snapshot fields. Does not invent composition.
 */
export function clearStaleSourceMealDocumentPointer(
  payload: Record<string, unknown>,
  staleId: string,
  clearedAt: string = new Date().toISOString(),
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  delete next.source_meal_document_id;
  return {
    ...next,
    cleared_stale_source_meal_document_id: staleId,
    stale_source_meal_document_cleared_at: clearedAt,
    attach_compatibility_note: STALE_POINTER_COMPAT_NOTE,
  };
}

/**
 * Person-scoped attach gate for NEW planned-meal writes that reference a
 * library MealDocument. Throws PlanRequestValidationError when blocked.
 */
export async function assertMealDocumentAttachableForPlan(args: {
  personId: string;
  sourceMealDocumentId: string;
}): Promise<MealDocument> {
  const doc = await getMealDocumentForPerson(args.personId, args.sourceMealDocumentId);
  if (!doc) {
    throw new PlanRequestValidationError(
      'MealDocument not found for this person.',
    );
  }
  if (isMealDocumentArchived(doc)) {
    throw new PlanRequestValidationError(
      'Archived MealDocuments cannot be newly attached to a plan.',
    );
  }
  return doc;
}

function normalizePointerPayload(
  payload: Record<string, unknown>,
  doc: MealDocument,
): Record<string, unknown> {
  const existingServings = payload.planned_servings;
  const plannedServings =
    typeof existingServings === 'number' && Number.isFinite(existingServings)
      ? existingServings
      : null;
  return stampPlannedMealDocumentPointer(payload, doc, plannedServings);
}

/**
 * When a create/update payload carries source_meal_document_id, validate the
 * document is attachable and normalize pointer + planned_servings on the payload.
 * Payloads without a pointer pass through unchanged (manual/AI meals).
 *
 * Strict: missing / cross-person / archived pointers are rejected.
 */
export async function preparePlannedMealPayloadForAttach(args: {
  personId: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const sourceId = readSourceMealDocumentId(args.payload);
  if (!sourceId) return args.payload;

  const doc = await assertMealDocumentAttachableForPlan({
    personId: args.personId,
    sourceMealDocumentId: sourceId,
  });

  return normalizePointerPayload(args.payload, doc);
}

/**
 * Attach preparation for reusable template/pattern snapshot instantiation.
 *
 * - Valid same-person active pointer → stamp as usual (gate unchanged).
 * - Archived pointer → still rejected (do not weaken archived attach rules).
 * - Missing / cross-person pointer + embedded snapshot → clear pointer only,
 *   preserve embedded payload, stamp compatibility audit fields.
 * - Missing pointer without embedded composition → reject (cannot invent meal).
 */
export async function prepareReusableSnapshotPayloadForAttach(args: {
  personId: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const sourceId = readSourceMealDocumentId(args.payload);
  if (!sourceId) return args.payload;

  const doc = await getMealDocumentForPerson(args.personId, sourceId);
  if (doc) {
    if (isMealDocumentArchived(doc)) {
      throw new PlanRequestValidationError(
        'Archived MealDocuments cannot be newly attached to a plan.',
      );
    }
    return normalizePointerPayload(args.payload, doc);
  }

  if (hasReusableEmbeddedMealSnapshot(args.payload)) {
    return clearStaleSourceMealDocumentPointer(args.payload, sourceId);
  }

  throw new PlanRequestValidationError('MealDocument not found for this person.');
}
