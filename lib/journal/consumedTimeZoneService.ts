/**
 * Resolve the timezone used to author a subject's consumed day.
 *
 * NDS Integrity v1. Server-only: never import this from browser code.
 *
 * The consumed day belongs to the person who ate the food. This module exists so
 * that ownership cannot be lost by accident:
 *
 *   1. The subject's own stored preference (`people.consumed_time_zone`) always
 *      wins.
 *   2. A request-supplied zone is honoured ONLY when the requester is the
 *      subject themselves. A coach viewing or editing a client's journal from
 *      another continent cannot move the client's meals to a different day.
 *   3. Otherwise the zone is unknown, and the caller writes no day metadata.
 *      Reads then use the deterministic UTC compatibility bucket — the same
 *      selection Log already performs — instead of a confident wrong answer.
 *
 * A NULL result is a correct, expected outcome, not a failure.
 */

import { supabaseAdmin } from '../supabaseServerClient';
import { isSupportedTimeZone, resolveConsumedTimeZone } from '../nds/dayIdentity';

export interface ResolvedConsumedTimeZone {
  /** IANA identifier, or null when unknown. */
  timeZone: string | null;
  source: 'subject_preference' | 'subject_request' | 'unknown';
}

/**
 * Read the subject's stored preference.
 *
 * Tolerates the column not existing yet: the expand migration that adds
 * `people.consumed_time_zone` is applied separately from this code, so during
 * that window a missing column must degrade to "unknown" rather than break
 * journal writes.
 */
export async function getSubjectStoredTimeZone(personId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('people')
      .select('consumed_time_zone')
      .eq('id', personId)
      .maybeSingle();

    if (error) {
      console.warn(
        '[ConsumedTimeZone] Could not read stored zone; treating as unknown:',
        error.message,
      );
      return null;
    }

    const stored = (data as { consumed_time_zone?: string | null } | null)?.consumed_time_zone;
    return isSupportedTimeZone(stored) ? stored : null;
  } catch (lookupError) {
    // An unknown zone degrades to the UTC compatibility bucket. Failing the
    // journal write instead would mean a person cannot log food because their
    // timezone preference could not be read.
    console.warn(
      '[ConsumedTimeZone] Zone lookup threw; treating as unknown:',
      lookupError instanceof Error ? lookupError.message : lookupError,
    );
    return null;
  }
}

/**
 * Resolve the zone to author `consumed_day` with for a write against `personId`.
 *
 * `requestIsSubjectThemselves` must be true only when the authenticated caller IS
 * the subject. When it is false the declared request zone is discarded entirely,
 * so a coach in another timezone cannot decide which day a client's food counts
 * toward.
 */
export async function resolveSubjectConsumedTimeZone(args: {
  personId: string;
  requestTimeZone?: string | null;
  requestIsSubjectThemselves: boolean;
}): Promise<ResolvedConsumedTimeZone> {
  const stored = await getSubjectStoredTimeZone(args.personId);

  const resolved = resolveConsumedTimeZone({
    subjectStoredTimeZone: stored,
    requestTimeZone: args.requestTimeZone ?? null,
    requestIsSubjectThemselves: args.requestIsSubjectThemselves,
  });

  // resolveConsumedTimeZone falls back to UTC so that pure day arithmetic always
  // has a zone. At the WRITE boundary that fallback is not acceptable: stamping
  // UTC onto a record would assert a local day nobody chose. Report unknown and
  // let the caller omit the metadata.
  if (resolved.source === 'fallback_utc') {
    return { timeZone: null, source: 'unknown' };
  }

  return { timeZone: resolved.timeZone, source: resolved.source };
}
