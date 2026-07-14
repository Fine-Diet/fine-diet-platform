/**
 * Undo-path journal integrity — only tolerate a confirmed absent entry.
 */
import { deleteEntry, getEntry } from '@/lib/journal/journalServerService';

export async function removeLinkedJournalEntryForUndo(
  personId: string,
  entryId: string,
): Promise<void> {
  const existing = await getEntry(personId, entryId);
  if (!existing) return;
  await deleteEntry(personId, entryId);
}
