import { describe, expect, test } from '@jest/globals';

import { loadJournalEntriesForHome } from '@/components/app/home/AppHomeView';
import type { JournalEntry } from '@/lib/journal';

describe('App home Journal read failures', () => {
  test('keeps the Programs result available and discards stale Journal entries', async () => {
    const staleEntry = { id: 'old-entry' } as JournalEntry;
    const programs = Promise.resolve({ status: 'ready' });
    const journal = loadJournalEntriesForHome(
      async () => {
        throw new Error('Journal unavailable');
      },
      '2026-11-04',
    );

    const [journalResult, programsResult] = await Promise.all([journal, programs]);

    expect(journalResult).toEqual({ entries: [], error: true });
    expect(journalResult.entries).not.toContain(staleEntry);
    expect(programsResult).toEqual({ status: 'ready' });
  });
});
