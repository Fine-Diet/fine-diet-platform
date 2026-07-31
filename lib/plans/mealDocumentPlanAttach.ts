/**
 * Package 4 — server-side MealDocument → planned_meals attach gates.
 *
 * Plans store a pointer + planned servings; MealDocuments remain canonical
 * meal truth. New attachments of archived documents are rejected; existing
 * references remain readable via Package 3 GET-by-id.
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

/**
 * When a create/update payload carries source_meal_document_id, validate the
 * document is attachable and normalize pointer + planned_servings on the payload.
 * Payloads without a pointer pass through unchanged (manual/AI meals).
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

  const existingServings = args.payload.planned_servings;
  const plannedServings =
    typeof existingServings === 'number' && Number.isFinite(existingServings)
      ? existingServings
      : null;

  return stampPlannedMealDocumentPointer(args.payload, doc, plannedServings);
}
