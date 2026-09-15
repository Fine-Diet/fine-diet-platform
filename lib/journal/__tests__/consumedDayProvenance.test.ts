/**
 * NDS Integrity v1 — consumed-day provenance at the journal write boundary.
 *
 * These tests pin the properties that make day membership trustworthy:
 *   - the server authors it, a client never does;
 *   - a delegate's timezone cannot define another person's day;
 *   - an unknown timezone produces ABSENCE, not a guess;
 *   - an ordinary edit never silently relabels which day a past entry belongs to.
 *
 * The process timezone is deliberately irrelevant to every assertion here. The
 * suite is also run under a non-UTC TZ in the verification matrix.
 */

interface PersonRow {
  consumed_time_zone: string | null;
}

let storedTimeZone: string | null = null;
let insertedRow: Record<string, unknown> | null = null;
let existingEntryRow: Record<string, unknown> | null = null;
let persistedUpdates: Record<string, unknown> = {};

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'people') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => ({
          data: { consumed_time_zone: storedTimeZone } as PersonRow,
          error: null,
        });
        return chain;
      }

      if (table === 'journal_entries') {
        const chain: Record<string, unknown> = {};
        chain.insert = (row: Record<string, unknown>) => {
          insertedRow = row;
          return chain;
        };
        chain.update = (updates: Record<string, unknown>) => {
          persistedUpdates = updates;
          return chain;
        };
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.single = async () => ({
          data: insertedRow
            ? { created_at: NOW_ISO, updated_at: NOW_ISO, ...insertedRow }
            : { ...existingEntryRow, ...persistedUpdates },
          error: null,
        });
        return chain;
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  },
}));

import { createEntry, updateEntry } from '../journalServerService';
import { NDS_DAY_POLICY_VERSION } from '@/lib/nds/dayIdentity';

const NOW_ISO = '2026-09-12T18:00:00.000Z';

/** 01:30 UTC on the 13th is still the 12th in Chicago (UTC-5 in September). */
const LATE_NIGHT_CHICAGO = new Date('2026-09-13T01:30:00.000Z');

function intakePayload(extra: Record<string, unknown> = {}) {
  return {
    name: 'Lentils',
    quantity: 1,
    unit: 'serving',
    calories: 230,
    macros: { protein: 18, carbs: 40, fat: 1 },
    servingSizeG: 200,
    ...extra,
  };
}

function insertedPayload(): Record<string, unknown> {
  return (insertedRow?.payload ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  storedTimeZone = null;
  insertedRow = null;
  existingEntryRow = null;
  persistedUpdates = {};
});

describe('create: server-authored consumed day', () => {
  it('stamps the subject calendar day, not the UTC day, for a late-night entry', async () => {
    storedTimeZone = 'America/Chicago';

    await createEntry({
      personId: 'person-1',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload(),
    });

    expect(insertedPayload().consumed_day).toEqual({
      date_local: '2026-09-12',
      time_zone: 'America/Chicago',
      utc_instant: '2026-09-13T01:30:00.000Z',
      policy_version: NDS_DAY_POLICY_VERSION,
    });
  });

  it('leaves the day absent when the subject timezone is unknown', async () => {
    storedTimeZone = null;

    await createEntry({
      personId: 'person-1',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload(),
    });

    // Absence is the correct answer: reads fall back to the labelled UTC
    // compatibility bucket rather than asserting a local day nobody chose.
    expect(insertedPayload()).not.toHaveProperty('consumed_day');
  });

  it('discards a client-supplied consumed_day instead of trusting it', async () => {
    storedTimeZone = 'America/Chicago';

    await createEntry({
      personId: 'person-1',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload({
        consumed_day: {
          date_local: '2026-01-01',
          time_zone: 'Pacific/Kiritimati',
          utc_instant: '2026-01-01T00:00:00.000Z',
          policy_version: 'forged',
        },
      }) as never,
    });

    expect(insertedPayload().consumed_day).toMatchObject({
      date_local: '2026-09-12',
      time_zone: 'America/Chicago',
    });
  });

  it('drops a client-supplied consumed_day even when the server has no zone to replace it with', async () => {
    storedTimeZone = null;

    await createEntry({
      personId: 'person-1',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload({
        consumed_day: {
          date_local: '2026-01-01',
          time_zone: 'Pacific/Kiritimati',
          utc_instant: '2026-01-01T00:00:00.000Z',
          policy_version: 'forged',
        },
      }) as never,
    });

    expect(insertedPayload()).not.toHaveProperty('consumed_day');
  });

  it('ignores a request timezone when the caller is not the subject', async () => {
    storedTimeZone = null;

    await createEntry({
      personId: 'client-person',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload(),
      requestTimeZone: 'Australia/Sydney',
      requestIsSubjectThemselves: false,
    });

    // A coach in Sydney must not move a client's meal to the next day.
    expect(insertedPayload()).not.toHaveProperty('consumed_day');
  });

  it('honours a request timezone only for the subject themselves', async () => {
    storedTimeZone = null;

    await createEntry({
      personId: 'person-1',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload(),
      requestTimeZone: 'America/Chicago',
      requestIsSubjectThemselves: true,
    });

    expect(insertedPayload().consumed_day).toMatchObject({ date_local: '2026-09-12' });
  });

  it("prefers the subject's stored preference over their current request zone", async () => {
    storedTimeZone = 'America/Chicago';

    await createEntry({
      personId: 'person-1',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload(),
      // Travelling, or a device with a misconfigured clock.
      requestTimeZone: 'Australia/Sydney',
      requestIsSubjectThemselves: true,
    });

    expect(insertedPayload().consumed_day).toMatchObject({
      time_zone: 'America/Chicago',
      date_local: '2026-09-12',
    });
  });

  it('rejects a bare numeric offset, which cannot carry daylight-saving rules', async () => {
    storedTimeZone = null;

    await createEntry({
      personId: 'person-1',
      entryType: 'intake',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: intakePayload(),
      requestTimeZone: '-05:00',
      requestIsSubjectThemselves: true,
    });

    expect(insertedPayload()).not.toHaveProperty('consumed_day');
  });

  it('does not attach day membership to non-consumption entries', async () => {
    storedTimeZone = 'America/Chicago';

    await createEntry({
      personId: 'person-1',
      entryType: 'water',
      occurredAt: LATE_NIGHT_CHICAGO,
      payload: { amount: 16, unit: 'oz' } as never,
    });

    expect(insertedPayload()).not.toHaveProperty('consumed_day');
  });
});

describe('update: membership is preserved, never quietly relabelled', () => {
  const EXISTING_DAY = {
    date_local: '2026-09-12',
    time_zone: 'America/Chicago',
    utc_instant: '2026-09-13T01:30:00.000Z',
    policy_version: NDS_DAY_POLICY_VERSION,
  };

  function seedExisting(payloadExtra: Record<string, unknown> = {}) {
    existingEntryRow = {
      id: 'entry-1',
      person_id: 'person-1',
      entry_type: 'intake',
      occurred_at: '2026-09-13T01:30:00.000Z',
      payload: { ...intakePayload(), ...payloadExtra },
      quantity_g: 200,
      protein_score_10: null,
      is_main_meal: null,
      meal_derived_data: null,
      created_at: NOW_ISO,
      updated_at: NOW_ISO,
    };
  }

  it('preserves the recorded day when only the quantity changes', async () => {
    seedExisting({ consumed_day: EXISTING_DAY });
    storedTimeZone = 'Australia/Sydney'; // must not leak into a past entry

    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: { quantity: 2, unit: 'serving' },
      requestTimeZone: 'Australia/Sydney',
      requestIsSubjectThemselves: true,
    });

    const payload = persistedUpdates.payload as Record<string, unknown>;
    expect(payload.consumed_day).toEqual(EXISTING_DAY);
    expect(payload.quantity).toBe(2);
  });

  it('preserves the ABSENCE of a day on a legacy entry, rather than backfilling one', async () => {
    seedExisting();
    storedTimeZone = 'America/Chicago';

    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: { quantity: 3, unit: 'serving' },
      requestTimeZone: 'America/Chicago',
      requestIsSubjectThemselves: true,
    });

    const payload = persistedUpdates.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('consumed_day');
  });

  it("re-derives membership when the entry moves in time, using the entry's own zone", async () => {
    seedExisting({ consumed_day: EXISTING_DAY });
    // A different current zone must not decide where a past meal was eaten.
    storedTimeZone = 'Australia/Sydney';

    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      // Moved forward two hours: now the 13th in Chicago too.
      occurredAt: new Date('2026-09-13T06:30:00.000Z'),
      requestTimeZone: 'Australia/Sydney',
      requestIsSubjectThemselves: true,
    });

    const payload = persistedUpdates.payload as Record<string, unknown>;
    expect(payload.consumed_day).toEqual({
      date_local: '2026-09-13',
      time_zone: 'America/Chicago',
      utc_instant: '2026-09-13T06:30:00.000Z',
      policy_version: NDS_DAY_POLICY_VERSION,
    });
  });

  it('discards a client-supplied consumed_day on update', async () => {
    seedExisting({ consumed_day: EXISTING_DAY });

    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: {
        consumed_day: {
          date_local: '2030-01-01',
          time_zone: 'Pacific/Kiritimati',
          utc_instant: '2030-01-01T00:00:00.000Z',
          policy_version: 'forged',
        },
      } as never,
    });

    const payload = persistedUpdates.payload as Record<string, unknown>;
    expect(payload.consumed_day).toEqual(EXISTING_DAY);
  });

  it('keeps membership through a full payload replacement', async () => {
    seedExisting({ consumed_day: EXISTING_DAY });

    await updateEntry({
      personId: 'person-1',
      entryId: 'entry-1',
      payload: intakePayload({ name: 'Replaced food' }) as never,
      replacePayload: true,
    });

    const payload = persistedUpdates.payload as Record<string, unknown>;
    expect(payload.name).toBe('Replaced food');
    expect(payload.consumed_day).toEqual(EXISTING_DAY);
  });
});
