import { entryBelongsToJournalDate, journalService } from '../journalService';
import { buildConsumedDayMetadata } from '@/lib/nds/dayIdentity';

describe('Journal persisted reads', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('keeps entries on the member-authored consumed day when UTC timestamp date differs', async () => {
    const timestamp = '2026-11-04T02:30:00.000Z';
    const entry = {
      id: 'entry-1',
      type: 'intake',
      timestamp,
      block: 'evening',
      payload: {
        name: 'Late meal',
        consumed_day: buildConsumedDayMetadata(new Date(timestamp), 'America/Chicago'),
      },
      created_at: timestamp,
      updated_at: timestamp,
    };
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ entries: [entry] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as jest.Mock;

    const entries = await journalService.listEntriesByDayOrThrow(new Date(2026, 10, 3, 12));

    expect(entries).toHaveLength(1);
    expect(entryBelongsToJournalDate(entries[0], '2026-11-03')).toBe(true);
    expect(entryBelongsToJournalDate(entries[0], '2026-11-04')).toBe(false);
  });

  it('preserves a failed read so the Journal view can show and retry the error', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Journal temporarily unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as jest.Mock;

    await expect(
      journalService.listEntriesByDayOrThrow(new Date(2026, 10, 3, 12)),
    ).rejects.toThrow('Journal temporarily unavailable');
  });
});
