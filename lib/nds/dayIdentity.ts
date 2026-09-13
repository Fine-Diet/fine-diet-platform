/**
 * Canonical consumed-day identity for actual consumption.
 *
 * NDS-01 checkpoint B. This is the ONE day-membership helper shared by Log
 * selection, NDS inputs, revision invalidation, and queue requests. Pure: no
 * database, no network, no ambient timezone.
 *
 * Why explicit metadata is required
 * --------------------------------
 * `journal_entries.occurred_at` is PostgreSQL `timestamptz` and the database
 * runs in UTC, so the originally supplied offset is not recoverable from the
 * stored value (https://www.postgresql.org/docs/current/datatype-datetime.html).
 * The previous implementation parsed an offset out of the serialized string,
 * which the write path had already normalized away with `toISOString()`.
 *
 * New records therefore carry server-authored `payload.consumed_day` metadata:
 * a real calendar date, an IANA timezone, the UTC instant, and this policy
 * version. Historical records have none. They are attributed with a
 * DETERMINISTIC COMPATIBILITY BUCKET (the UTC calendar date, which is what Log
 * selection has always used) and labelled `legacy_unverified`. That label is
 * not a claim about the original local day, and nothing here rewrites history.
 */

import type { TimeBlock } from '@/lib/journal/types';

/**
 * Identity of this day-attribution policy. Separate from the formula and
 * classifier versions: changing how days are attributed invalidates cached
 * outputs even when the formula is untouched.
 */
export const NDS_DAY_POLICY_VERSION = 'nds_day_policy_2026-09-12.v1';

/** Scoring-block boundaries, preserved exactly from lib/journal/types. */
const BLOCK_MORNING_START_HOUR = 4;
const BLOCK_MIDDAY_START_HOUR = 12;
const BLOCK_EVENING_START_HOUR = 17;

/** How an entry's consumed day was established. */
export type ConsumedDayProvenance =
  /** Server-authored metadata recorded at the time of consumption. */
  | 'explicit'
  /**
   * No metadata. Attributed by the deterministic UTC compatibility bucket and
   * NOT proof of the original local day.
   */
  | 'legacy_unverified';

/** Day provenance rolled up across the members of one day. */
export type DayProvenanceSummary =
  | 'explicit'
  | 'legacy_unverified'
  | 'mixed'
  | 'empty';

/** Server-authored consumed-day metadata stored on the entry payload. */
export interface ConsumedDayMetadata {
  /** Real calendar date in the consuming person's timezone. */
  date_local: string;
  /** IANA timezone identifier, e.g. 'America/Chicago'. */
  time_zone: string;
  /** UTC instant of consumption. */
  utc_instant: string;
  /** Policy version that produced this attribution. */
  policy_version: string;
}

export interface ConsumedDayAttribution {
  dateLocal: string;
  provenance: ConsumedDayProvenance;
  /** IANA zone when known; null for the legacy bucket (which is UTC-based). */
  timeZone: string | null;
  utcInstant: string;
  policyVersion: string;
}

export type ConsumedDayValidation =
  | { ok: true; metadata: ConsumedDayMetadata }
  | { ok: false; code: ConsumedDayValidationCode; detail: string };

export type ConsumedDayValidationCode =
  | 'missing'
  | 'malformed_shape'
  | 'invalid_date'
  | 'invalid_time_zone'
  | 'invalid_instant'
  | 'inconsistent_date_for_zone';

// ============================================================================
// Primitives
// ============================================================================

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a calendar date. Rejects impossible dates such as 2026-02-30 that a
 * pattern match alone would accept.
 */
export function isRealCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

/**
 * IANA identifier shape: `UTC`, or `Region/City` (optionally deeper). Bare
 * numeric offsets such as `-05:00` are deliberately excluded even though the
 * runtime accepts them: a fixed offset cannot carry daylight-saving rules, so it
 * cannot determine a correct local day across a transition.
 */
const IANA_ZONE_PATTERN = /^(UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+)$/;

/** Is this an IANA timezone identifier the runtime actually recognizes? */
export function isSupportedTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();
  if (!IANA_ZONE_PATTERN.test(candidate)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

/** Is this a parseable instant? */
function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

/**
 * Wall-clock parts of a UTC instant in a named zone. Uses Intl rather than any
 * ambient/server timezone, which is the specific defect being repaired.
 */
export function localPartsInZone(instant: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  // Intl renders midnight as hour 24 in some locales/zones.
  const hour = Number(parts.hour) % 24;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
  };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Calendar date of a UTC instant in a named zone. */
export function localDateInZone(instant: Date, timeZone: string): string {
  const parts = localPartsInZone(instant, timeZone);
  return formatDate(parts.year, parts.month, parts.day);
}

/**
 * Deterministic compatibility bucket for records with no day metadata: the UTC
 * calendar date. This matches what Log selection has always used, so Log and
 * NDS agree on legacy rows. It is a bucket, not evidence of the local day.
 */
export function legacyCompatibilityBucket(instant: Date): string {
  return formatDate(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
}

// ============================================================================
// Block derivation
// ============================================================================

/**
 * Scoring block for a consumed instant, derived in an explicit zone.
 *
 * Boundaries are preserved exactly: morning 04:00-11:59, midday 12:00-16:59,
 * evening 17:00-03:59. Only the timezone the local hour is read in changes —
 * previously it was whatever the server process happened to be set to.
 */
export function deriveBlockInZone(instant: Date, timeZone: string): TimeBlock {
  const { hour } = localPartsInZone(instant, timeZone);
  if (hour >= BLOCK_MORNING_START_HOUR && hour < BLOCK_MIDDAY_START_HOUR) return 'morning';
  if (hour >= BLOCK_MIDDAY_START_HOUR && hour < BLOCK_EVENING_START_HOUR) return 'midday';
  return 'evening';
}

/** Scoring block for an attributed entry, using its own recorded zone. */
export function deriveBlockForAttribution(attribution: ConsumedDayAttribution): TimeBlock {
  const instant = new Date(attribution.utcInstant);
  // Legacy rows have no recorded zone; UTC is the labelled bucket basis and is
  // used explicitly instead of falling back to the server machine's zone.
  return deriveBlockInZone(instant, attribution.timeZone ?? 'UTC');
}

// ============================================================================
// Validation and authoring
// ============================================================================

/**
 * Validate consumed-day metadata found on a payload.
 *
 * Consistency between date, zone, and instant is enforced: a date that the zone
 * and instant do not actually produce is rejected rather than trusted.
 */
export function validateConsumedDayMetadata(value: unknown): ConsumedDayValidation {
  if (value === undefined || value === null) {
    return { ok: false, code: 'missing', detail: 'no consumed_day metadata present' };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'malformed_shape', detail: 'consumed_day is not an object' };
  }

  const record = value as Record<string, unknown>;

  if (!isRealCalendarDate(record.date_local)) {
    return {
      ok: false,
      code: 'invalid_date',
      detail: `date_local ${JSON.stringify(record.date_local)} is not a real calendar date`,
    };
  }
  if (!isSupportedTimeZone(record.time_zone)) {
    return {
      ok: false,
      code: 'invalid_time_zone',
      detail: `time_zone ${JSON.stringify(record.time_zone)} is not a supported IANA zone`,
    };
  }
  const instant = parseInstant(record.utc_instant);
  if (!instant) {
    return {
      ok: false,
      code: 'invalid_instant',
      detail: `utc_instant ${JSON.stringify(record.utc_instant)} is not a parseable instant`,
    };
  }

  const derived = localDateInZone(instant, record.time_zone as string);
  if (derived !== record.date_local) {
    return {
      ok: false,
      code: 'inconsistent_date_for_zone',
      detail: `date_local ${record.date_local} does not match ${record.utc_instant} in ${record.time_zone} (which is ${derived})`,
    };
  }

  return {
    ok: true,
    metadata: {
      date_local: record.date_local as string,
      time_zone: record.time_zone as string,
      utc_instant: instant.toISOString(),
      policy_version:
        typeof record.policy_version === 'string' && record.policy_version.trim() !== ''
          ? record.policy_version
          : NDS_DAY_POLICY_VERSION,
    },
  };
}

/**
 * Author consumed-day metadata server-side from a validated zone and instant.
 *
 * The calendar date is DERIVED, never taken from the client, so a client cannot
 * assert that food was eaten on a different day than its instant and zone say.
 */
export function buildConsumedDayMetadata(
  occurredAt: Date,
  timeZone: string,
): ConsumedDayMetadata | null {
  if (!isSupportedTimeZone(timeZone)) return null;
  if (Number.isNaN(occurredAt.getTime())) return null;
  return {
    date_local: localDateInZone(occurredAt, timeZone),
    time_zone: timeZone,
    utc_instant: occurredAt.toISOString(),
    policy_version: NDS_DAY_POLICY_VERSION,
  };
}

/**
 * Choose the consuming person's timezone context.
 *
 * The subject's own stored preference wins. A request-supplied zone is only
 * used when the request is the subject acting on their own record, so an
 * administrator's or delegate's machine timezone can never define another
 * person's consumed day.
 */
export function resolveConsumedTimeZone(input: {
  subjectStoredTimeZone?: string | null;
  requestTimeZone?: string | null;
  requestIsSubjectThemselves: boolean;
}): { timeZone: string; source: 'subject_preference' | 'subject_request' | 'fallback_utc' } {
  if (isSupportedTimeZone(input.subjectStoredTimeZone)) {
    return { timeZone: input.subjectStoredTimeZone as string, source: 'subject_preference' };
  }
  if (input.requestIsSubjectThemselves && isSupportedTimeZone(input.requestTimeZone)) {
    return { timeZone: input.requestTimeZone as string, source: 'subject_request' };
  }
  return { timeZone: 'UTC', source: 'fallback_utc' };
}

// ============================================================================
// Membership
// ============================================================================

/**
 * Attribute one entry to a consumed day.
 *
 * Metadata that fails validation is treated as absent: the entry falls back to
 * the labelled legacy bucket rather than being trusted or moved.
 */
export function attributeConsumedDay(entry: {
  occurred_at: string;
  payload?: Record<string, unknown> | null;
}): ConsumedDayAttribution & { metadataRejection?: ConsumedDayValidationCode } {
  const instant = new Date(entry.occurred_at);
  const validation = validateConsumedDayMetadata(entry.payload?.consumed_day);

  if (validation.ok) {
    return {
      dateLocal: validation.metadata.date_local,
      provenance: 'explicit',
      timeZone: validation.metadata.time_zone,
      utcInstant: validation.metadata.utc_instant,
      policyVersion: validation.metadata.policy_version,
    };
  }

  return {
    dateLocal: legacyCompatibilityBucket(instant),
    provenance: 'legacy_unverified',
    timeZone: null,
    utcInstant: Number.isNaN(instant.getTime()) ? entry.occurred_at : instant.toISOString(),
    policyVersion: NDS_DAY_POLICY_VERSION,
    ...(validation.code === 'missing' ? {} : { metadataRejection: validation.code }),
  };
}

/** Does this entry belong to the requested consumed day? */
export function belongsToConsumedDay(
  entry: { occurred_at: string; payload?: Record<string, unknown> | null },
  dateLocal: string,
): boolean {
  return attributeConsumedDay(entry).dateLocal === dateLocal;
}

/**
 * UTC instant window that must be scanned to find every entry that could belong
 * to a local day. Widened by 14h on each side so no real-world zone is missed;
 * membership is then decided per entry by `attributeConsumedDay`.
 */
export function consumedDayScanWindow(dateLocal: string): { start: string; end: string } {
  const [year, month, day] = dateLocal.split('-').map(Number);
  const midnightUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const hour = 60 * 60 * 1000;
  return {
    start: new Date(midnightUtc - 14 * hour).toISOString(),
    end: new Date(midnightUtc + 38 * hour).toISOString(),
  };
}

/** Roll per-entry provenance up to a single day-level label. */
export function summarizeDayProvenance(
  provenances: readonly ConsumedDayProvenance[],
): DayProvenanceSummary {
  if (provenances.length === 0) return 'empty';
  const hasExplicit = provenances.includes('explicit');
  const hasLegacy = provenances.includes('legacy_unverified');
  if (hasExplicit && hasLegacy) return 'mixed';
  return hasExplicit ? 'explicit' : 'legacy_unverified';
}

/**
 * Days whose cached scores a mutation invalidates.
 *
 * A move across dates must invalidate BOTH the old and the new day. Returns a
 * deduplicated, sorted list so callers can lock in a stable order.
 */
export function affectedConsumedDays(
  before: { occurred_at: string; payload?: Record<string, unknown> | null } | null,
  after: { occurred_at: string; payload?: Record<string, unknown> | null } | null,
): string[] {
  const days = new Set<string>();
  if (before) days.add(attributeConsumedDay(before).dateLocal);
  if (after) days.add(attributeConsumedDay(after).dateLocal);
  return Array.from(days).sort();
}
