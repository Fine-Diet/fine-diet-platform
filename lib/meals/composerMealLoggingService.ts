/**
 * Plans Authoring Convergence — Phase 2: compatibility wrapper for logging an
 * in-memory (possibly unsaved) MealDocument.
 *
 * groupedMealLoggingService.logMealDocumentForPerson requires a PERSISTED
 * MealDocument id and performs a DB round trip (getMealDocumentForPerson) to
 * load it before logging. The shared Meal Composer's 'log' context needs to
 * log a composition that may never be saved as a MealDocument at all (e.g.
 * "Log Meal" without "Save as Meal") — a DB round trip is not needed just to
 * log an unsaved draft.
 *
 * This module is a THIN, ADDITIVE wrapper: it reuses the EXACT SAME pure
 * payload builder (buildGroupedMealIntakePayload) and the EXACT SAME
 * `createEntry` write call that `logMealDocumentForPerson` uses — it only
 * skips the `getMealDocumentForPerson` lookup. Per the Phase 2 decision:
 *   - logMealDocumentForPerson's signature is UNCHANGED.
 *   - No competing grouped-entry format is introduced — the entry this
 *     writes is byte-for-byte the same shape logMealDocumentForPerson would
 *     have written for an equivalent persisted document.
 */

import { createEntry, type JournalEntry, type JournalEntryPayload } from '@/lib/journal/journalServerService';

import {
  GroupedMealLogValidationError,
  buildGroupedMealIntakePayload,
  validateGroupedMealLogInput,
  type GroupedMealLogInput,
} from './groupedMealLoggingService';
import type { MealDocument } from './types';

/**
 * Log an in-memory MealDocument (composer draft) as EXACTLY ONE grouped
 * journal intake entry, without requiring it to be persisted first.
 *
 * Person scope: the entry is created with the CALLER-SUPPLIED `personId` —
 * callers MUST derive this from the authenticated session, never from the
 * request body (the API route wiring this up enforces that; see
 * pages/api/journal/meals/documents/log-instance.ts). This function does not
 * itself validate document ownership because the document is not read from
 * storage; there is nothing to own yet.
 *
 * @throws GroupedMealLogValidationError when the log input is invalid.
 */
export async function logInMemoryMealDocumentForPerson(
  personId: string,
  document: MealDocument,
  input?: GroupedMealLogInput,
): Promise<JournalEntry> {
  const validated = validateGroupedMealLogInput(input);
  if (!validated.ok) throw new GroupedMealLogValidationError(validated.errors);
  const { consumed_servings, occurredAt, note } = validated.value;

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
