/**
 * NDS-01 checkpoint B — canonical consumed-day identity.
 *
 * Covers real local midnight, both daylight-saving transitions, malformed
 * dates/timezones, delegate context, and the legacy path that must not silently
 * rewrite history.
 */

import {
  affectedConsumedDays,
  attributeConsumedDay,
  belongsToConsumedDay,
  buildConsumedDayMetadata,
  consumedDayScanWindow,
  deriveBlockForAttribution,
  deriveBlockInZone,
  isRealCalendarDate,
  isSupportedTimeZone,
  legacyCompatibilityBucket,
  localDateInZone,
  NDS_DAY_POLICY_VERSION,
  resolveConsumedTimeZone,
  summarizeDayProvenance,
  validateConsumedDayMetadata,
} from '../dayIdentity';

describe('isRealCalendarDate', () => {
  it('accepts real dates including a leap day', () => {
    expect(isRealCalendarDate('2026-09-12')).toBe(true);
    expect(isRealCalendarDate('2028-02-29')).toBe(true);
  });

  it('rejects impossible dates that merely match the pattern', () => {
    expect(isRealCalendarDate('2026-02-30')).toBe(false);
    expect(isRealCalendarDate('2026-13-01')).toBe(false);
    expect(isRealCalendarDate('2026-00-10')).toBe(false);
    expect(isRealCalendarDate('2026-04-31')).toBe(false);
    expect(isRealCalendarDate('2027-02-29')).toBe(false);
  });

  it('rejects non-date input', () => {
    expect(isRealCalendarDate('12/09/2026')).toBe(false);
    expect(isRealCalendarDate('')).toBe(false);
    expect(isRealCalendarDate(20260912)).toBe(false);
    expect(isRealCalendarDate(null)).toBe(false);
  });
});

describe('isSupportedTimeZone', () => {
  it('accepts real IANA identifiers', () => {
    expect(isSupportedTimeZone('America/Chicago')).toBe(true);
    expect(isSupportedTimeZone('UTC')).toBe(true);
    expect(isSupportedTimeZone('Pacific/Auckland')).toBe(true);
  });

  it('rejects nonsense zones', () => {
    expect(isSupportedTimeZone('Mars/Olympus')).toBe(false);
    expect(isSupportedTimeZone('')).toBe(false);
    expect(isSupportedTimeZone(undefined)).toBe(false);
  });

  it('rejects bare numeric offsets, which cannot carry DST rules', () => {
    // The runtime accepts these as fixed-offset zones; a consumed day derived
    // from one would be wrong across a daylight-saving transition.
    expect(isSupportedTimeZone('-05:00')).toBe(false);
    expect(isSupportedTimeZone('+09:00')).toBe(false);
  });
});

describe('localDateInZone', () => {
  it('attributes a late-evening instant to the previous UTC day', () => {
    // 02:30 UTC on the 13th is 21:30 on the 12th in Chicago.
    expect(localDateInZone(new Date('2026-09-13T02:30:00.000Z'), 'America/Chicago')).toBe('2026-09-12');
  });

  it('attributes an early-morning instant to the next UTC day east of UTC', () => {
    expect(localDateInZone(new Date('2026-09-12T22:30:00.000Z'), 'Pacific/Auckland')).toBe('2026-09-13');
  });

  it('handles exact local midnight as the new day', () => {
    // 05:00 UTC is exactly 00:00 CDT.
    expect(localDateInZone(new Date('2026-09-13T05:00:00.000Z'), 'America/Chicago')).toBe('2026-09-13');
    expect(localDateInZone(new Date('2026-09-13T04:59:59.000Z'), 'America/Chicago')).toBe('2026-09-12');
  });
});

describe('deriveBlockInZone', () => {
  it('preserves the morning / midday / evening boundaries', () => {
    const at = (hourUtc: string) => new Date(`2026-09-12T${hourUtc}:00.000Z`);
    // Chicago is UTC-5 in September.
    expect(deriveBlockInZone(at('09:00'), 'America/Chicago')).toBe('morning'); // 04:00 local
    expect(deriveBlockInZone(at('16:59'), 'America/Chicago')).toBe('morning'); // 11:59 local
    expect(deriveBlockInZone(at('17:00'), 'America/Chicago')).toBe('midday'); // 12:00 local
    expect(deriveBlockInZone(at('21:59'), 'America/Chicago')).toBe('midday'); // 16:59 local
    expect(deriveBlockInZone(at('22:00'), 'America/Chicago')).toBe('evening'); // 17:00 local
    expect(deriveBlockInZone(at('08:59'), 'America/Chicago')).toBe('evening'); // 03:59 local
  });

  it('reads the block in the named zone, not the process timezone', () => {
    const instant = new Date('2026-09-12T13:00:00.000Z');
    expect(deriveBlockInZone(instant, 'America/Chicago')).toBe('morning'); // 08:00
    expect(deriveBlockInZone(instant, 'Asia/Tokyo')).toBe('evening'); // 22:00
    expect(deriveBlockInZone(instant, 'UTC')).toBe('midday'); // 13:00
  });

  it('handles the spring-forward transition', () => {
    // 2026-03-08 US DST start. 08:30 UTC is 02:30 CST -> clocks jump to 03:00 CDT.
    expect(localDateInZone(new Date('2026-03-08T08:30:00.000Z'), 'America/Chicago')).toBe('2026-03-08');
    // 07:30 UTC is 01:30 CST, still the 8th, still the evening block.
    expect(deriveBlockInZone(new Date('2026-03-08T07:30:00.000Z'), 'America/Chicago')).toBe('evening');
    // 09:30 UTC is 04:30 CDT — first morning-block hour after the jump.
    expect(deriveBlockInZone(new Date('2026-03-08T09:30:00.000Z'), 'America/Chicago')).toBe('morning');
  });

  it('handles the fall-back transition where a local hour repeats', () => {
    // 2026-11-01 US DST end. 06:30 UTC = 01:30 CDT; 07:30 UTC = 01:30 CST.
    const firstPass = new Date('2026-11-01T06:30:00.000Z');
    const secondPass = new Date('2026-11-01T07:30:00.000Z');
    expect(localDateInZone(firstPass, 'America/Chicago')).toBe('2026-11-01');
    expect(localDateInZone(secondPass, 'America/Chicago')).toBe('2026-11-01');
    // Both repeated local 01:30 readings land in the same block.
    expect(deriveBlockInZone(firstPass, 'America/Chicago')).toBe('evening');
    expect(deriveBlockInZone(secondPass, 'America/Chicago')).toBe('evening');
  });
});

describe('validateConsumedDayMetadata', () => {
  const valid = {
    date_local: '2026-09-12',
    time_zone: 'America/Chicago',
    utc_instant: '2026-09-13T02:30:00.000Z',
    policy_version: NDS_DAY_POLICY_VERSION,
  };

  it('accepts internally consistent metadata', () => {
    const result = validateConsumedDayMetadata(valid);
    expect(result.ok).toBe(true);
  });

  it('reports absence distinctly from corruption', () => {
    expect(validateConsumedDayMetadata(undefined)).toMatchObject({ ok: false, code: 'missing' });
    expect(validateConsumedDayMetadata(null)).toMatchObject({ ok: false, code: 'missing' });
    expect(validateConsumedDayMetadata('2026-09-12')).toMatchObject({ ok: false, code: 'malformed_shape' });
    expect(validateConsumedDayMetadata([])).toMatchObject({ ok: false, code: 'malformed_shape' });
  });

  it('rejects an impossible date rather than accepting a matching pattern', () => {
    expect(validateConsumedDayMetadata({ ...valid, date_local: '2026-02-30' })).toMatchObject({
      ok: false,
      code: 'invalid_date',
    });
  });

  it('rejects an unsupported timezone', () => {
    expect(validateConsumedDayMetadata({ ...valid, time_zone: 'EST5EDT-nonsense' })).toMatchObject({
      ok: false,
      code: 'invalid_time_zone',
    });
  });

  it('rejects an unparseable instant', () => {
    expect(validateConsumedDayMetadata({ ...valid, utc_instant: 'yesterday' })).toMatchObject({
      ok: false,
      code: 'invalid_instant',
    });
  });

  it('rejects a date the zone and instant do not actually produce', () => {
    expect(validateConsumedDayMetadata({ ...valid, date_local: '2026-09-13' })).toMatchObject({
      ok: false,
      code: 'inconsistent_date_for_zone',
    });
  });
});

describe('buildConsumedDayMetadata', () => {
  it('derives the calendar date server-side rather than trusting a claim', () => {
    const metadata = buildConsumedDayMetadata(new Date('2026-09-13T02:30:00.000Z'), 'America/Chicago');
    expect(metadata).toEqual({
      date_local: '2026-09-12',
      time_zone: 'America/Chicago',
      utc_instant: '2026-09-13T02:30:00.000Z',
      policy_version: NDS_DAY_POLICY_VERSION,
    });
  });

  it('refuses an unsupported zone instead of guessing one', () => {
    expect(buildConsumedDayMetadata(new Date('2026-09-12T12:00:00.000Z'), 'Nowhere/Void')).toBeNull();
  });

  it('refuses an invalid instant', () => {
    expect(buildConsumedDayMetadata(new Date('not a date'), 'UTC')).toBeNull();
  });
});

describe('resolveConsumedTimeZone', () => {
  it('prefers the subject’s stored preference', () => {
    expect(
      resolveConsumedTimeZone({
        subjectStoredTimeZone: 'America/Denver',
        requestTimeZone: 'Asia/Tokyo',
        requestIsSubjectThemselves: true,
      }),
    ).toEqual({ timeZone: 'America/Denver', source: 'subject_preference' });
  });

  it('uses the request zone only when the subject is acting on their own record', () => {
    expect(
      resolveConsumedTimeZone({
        subjectStoredTimeZone: null,
        requestTimeZone: 'Asia/Tokyo',
        requestIsSubjectThemselves: true,
      }),
    ).toEqual({ timeZone: 'Asia/Tokyo', source: 'subject_request' });
  });

  it('never lets a delegate’s machine timezone define another person’s day', () => {
    expect(
      resolveConsumedTimeZone({
        subjectStoredTimeZone: null,
        requestTimeZone: 'Asia/Tokyo',
        requestIsSubjectThemselves: false,
      }),
    ).toEqual({ timeZone: 'UTC', source: 'fallback_utc' });
  });
});

describe('attributeConsumedDay', () => {
  it('uses explicit metadata when present', () => {
    const attribution = attributeConsumedDay({
      occurred_at: '2026-09-13T02:30:00.000Z',
      payload: {
        consumed_day: {
          date_local: '2026-09-12',
          time_zone: 'America/Chicago',
          utc_instant: '2026-09-13T02:30:00.000Z',
          policy_version: NDS_DAY_POLICY_VERSION,
        },
      },
    });

    expect(attribution).toMatchObject({
      dateLocal: '2026-09-12',
      provenance: 'explicit',
      timeZone: 'America/Chicago',
    });
  });

  it('falls back to the labelled legacy bucket with no metadata', () => {
    const attribution = attributeConsumedDay({
      occurred_at: '2026-09-13T02:30:00.000Z',
      payload: {},
    });

    expect(attribution.provenance).toBe('legacy_unverified');
    expect(attribution.dateLocal).toBe('2026-09-13');
    expect(attribution.timeZone).toBeNull();
  });

  it('does not infer a local day from corrupted metadata', () => {
    const attribution = attributeConsumedDay({
      occurred_at: '2026-09-13T02:30:00.000Z',
      payload: { consumed_day: { date_local: '2026-09-01', time_zone: 'America/Chicago', utc_instant: '2026-09-13T02:30:00.000Z' } },
    });

    expect(attribution.provenance).toBe('legacy_unverified');
    expect(attribution.metadataRejection).toBe('inconsistent_date_for_zone');
    // The bucket is used; the corrupted claim is not honoured.
    expect(attribution.dateLocal).toBe('2026-09-13');
  });

  it('reads the scoring block in the entry’s own recorded zone', () => {
    const explicit = attributeConsumedDay({
      occurred_at: '2026-09-13T02:30:00.000Z',
      payload: {
        consumed_day: {
          date_local: '2026-09-12',
          time_zone: 'America/Chicago',
          utc_instant: '2026-09-13T02:30:00.000Z',
          policy_version: NDS_DAY_POLICY_VERSION,
        },
      },
    });
    // 21:30 local ⇒ evening.
    expect(deriveBlockForAttribution(explicit)).toBe('evening');

    const legacy = attributeConsumedDay({ occurred_at: '2026-09-13T02:30:00.000Z', payload: {} });
    // 02:30 UTC ⇒ evening under the labelled UTC bucket.
    expect(deriveBlockForAttribution(legacy)).toBe('evening');
  });
});

describe('belongsToConsumedDay and the scan window', () => {
  it('matches only the attributed day', () => {
    const entry = { occurred_at: '2026-09-13T02:30:00.000Z', payload: {} };
    expect(belongsToConsumedDay(entry, '2026-09-13')).toBe(true);
    expect(belongsToConsumedDay(entry, '2026-09-12')).toBe(false);
  });

  it('widens the scan window enough to cover every real-world zone', () => {
    const { start, end } = consumedDayScanWindow('2026-09-12');
    expect(start).toBe('2026-09-11T10:00:00.000Z');
    expect(end).toBe('2026-09-13T14:00:00.000Z');

    // The most extreme zones still fall inside the window.
    const auckland = buildConsumedDayMetadata(new Date('2026-09-11T12:00:00.000Z'), 'Pacific/Auckland');
    expect(auckland?.date_local).toBe('2026-09-12');
    expect(new Date(auckland!.utc_instant).getTime()).toBeGreaterThanOrEqual(new Date(start).getTime());
  });
});

describe('summarizeDayProvenance', () => {
  it('distinguishes empty, explicit, legacy, and mixed days', () => {
    expect(summarizeDayProvenance([])).toBe('empty');
    expect(summarizeDayProvenance(['explicit', 'explicit'])).toBe('explicit');
    expect(summarizeDayProvenance(['legacy_unverified'])).toBe('legacy_unverified');
    expect(summarizeDayProvenance(['explicit', 'legacy_unverified'])).toBe('mixed');
  });
});

describe('affectedConsumedDays', () => {
  it('invalidates both sides of a move across dates', () => {
    const before = { occurred_at: '2026-09-12T12:00:00.000Z', payload: {} };
    const after = { occurred_at: '2026-09-14T12:00:00.000Z', payload: {} };

    expect(affectedConsumedDays(before, after)).toEqual(['2026-09-12', '2026-09-14']);
  });

  it('returns one day when the date did not change', () => {
    const entry = { occurred_at: '2026-09-12T12:00:00.000Z', payload: {} };
    expect(affectedConsumedDays(entry, entry)).toEqual(['2026-09-12']);
  });

  it('covers insert-only and delete-only mutations', () => {
    const entry = { occurred_at: '2026-09-12T12:00:00.000Z', payload: {} };
    expect(affectedConsumedDays(null, entry)).toEqual(['2026-09-12']);
    expect(affectedConsumedDays(entry, null)).toEqual(['2026-09-12']);
    expect(affectedConsumedDays(null, null)).toEqual([]);
  });

  it('returns a stable sorted order so multi-day locks cannot deadlock', () => {
    const later = { occurred_at: '2026-09-20T12:00:00.000Z', payload: {} };
    const earlier = { occurred_at: '2026-09-02T12:00:00.000Z', payload: {} };
    expect(affectedConsumedDays(later, earlier)).toEqual(['2026-09-02', '2026-09-20']);
    expect(affectedConsumedDays(earlier, later)).toEqual(['2026-09-02', '2026-09-20']);
  });
});

describe('legacyCompatibilityBucket', () => {
  it('matches the UTC calendar date Log selection has always used', () => {
    expect(legacyCompatibilityBucket(new Date('2026-09-13T02:30:00.000Z'))).toBe('2026-09-13');
    expect(legacyCompatibilityBucket(new Date('2026-09-12T23:59:59.000Z'))).toBe('2026-09-12');
  });
});
