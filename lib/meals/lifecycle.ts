/**
 * Package 3 — MealDocument lifecycle (archive / restore).
 *
 * Archive is preferred over destructive deletion when downstream references
 * may exist. Archived documents remain readable by id; default library browse
 * excludes them. Implemented in document_json only (no production DDL).
 *
 * Pure helpers here; persistence lives in mealDocumentServerService.
 */

import type { MealDocument, MealLifecycleState } from './types';

/** Effective lifecycle for a document (legacy rows without the field ⇒ active). */
export function getMealLifecycleState(
  doc: Pick<MealDocument, 'lifecycle_state' | 'archived_at'>,
): MealLifecycleState {
  if (doc.lifecycle_state === 'archived' || doc.archived_at != null) {
    return 'archived';
  }
  return 'active';
}

export function isMealDocumentArchived(
  doc: Pick<MealDocument, 'lifecycle_state' | 'archived_at'>,
): boolean {
  return getMealLifecycleState(doc) === 'archived';
}

/**
 * Return a new document marked archived. Does not mutate input.
 * review_state is preserved so historical review truth is not rewritten.
 */
export function markMealDocumentArchived(
  doc: MealDocument,
  archivedAt: string = new Date().toISOString(),
): MealDocument {
  return {
    ...doc,
    lifecycle_state: 'archived',
    archived_at: archivedAt,
  };
}

/**
 * Return a new document restored to active. Does not mutate input.
 */
export function markMealDocumentRestored(doc: MealDocument): MealDocument {
  return {
    ...doc,
    lifecycle_state: 'active',
    archived_at: null,
  };
}
