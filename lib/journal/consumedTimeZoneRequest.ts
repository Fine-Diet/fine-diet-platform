/**
 * Pure request-side helper for consumed-day timezone provenance.
 *
 * Deliberately free of any database or Supabase import so API routes can read a
 * declared zone without pulling the server client into their module graph. The
 * precedence rule — subject's stored preference over a self-request zone, and
 * neither over a delegate's machine zone — lives in
 * lib/journal/consumedTimeZoneService.ts and is applied once at the write
 * boundary, not per route.
 */

import { isSupportedTimeZone } from '../nds/dayIdentity';

/** Request header a first-party client may set with its own IANA zone. */
export const CONSUMED_TIME_ZONE_HEADER = 'x-fd-time-zone';

/**
 * Extract a client-declared zone from request headers, validating its shape.
 *
 * A declared zone is only ever a CANDIDATE. It is honoured solely when the
 * requester is the subject of the write; see resolveSubjectConsumedTimeZone.
 */
export function readRequestTimeZone(
  headers: Record<string, string | string[] | undefined> | undefined | null,
): string | null {
  const raw = headers?.[CONSUMED_TIME_ZONE_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isSupportedTimeZone(value) ? value : null;
}
