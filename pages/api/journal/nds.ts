/**
 * GET /api/journal/nds
 *
 * Resolve the daily Nutrition Density Score for a person and day.
 *
 * Query parameters:
 * - person_id  (optional) Person UUID. Defaults to the authenticated person.
 * - date_local (optional) YYYY-MM-DD. Defaults to today in the request timezone.
 * - include_debug (optional) 'true' — admin only.
 *
 * The response is a DISCRIMINATED UNION on `state`
 * (fresh | updating | empty | insufficient_data | unavailable). Only `fresh` and
 * `updating` carry a score. This is the contract change that matters: an empty
 * day, an uninterpretable day, and a failed computation can no longer arrive as a
 * confident `nds_score_100: 0`.
 *
 * Failures return a real HTTP status with a stable reason code. The previous
 * handler returned HTTP 200 with an empty score and a raw `_error` string, which
 * both leaked internals and made every consumer treat a broken day as a zero.
 *
 * Authentication: Supabase session cookie, as with other journal APIs.
 * Authorization: own score, plus admins and holders of an active
 *   person_access_links(journal_read) grant.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import { requireJournalAuth, resolveJournalTargetPerson } from '@/lib/access/requireJournalAccess';
import { readRequestTimeZone } from '@/lib/journal/consumedTimeZoneRequest';
import { isRealCalendarDate, localPartsInZone } from '@/lib/nds/dayIdentity';
import { createSupabaseNdsPersistence } from '@/lib/nds/ndsPersistenceSupabase';
import { resolveDailyNDS } from '@/lib/nds/resolveDailyNDS';
import type { DailyNdsState } from '@/lib/nds/dailyNdsState';

interface NdsErrorResponse {
  error: string;
}

interface NdsSuccessResponse {
  nds: DailyNdsState;
  debug_data?: Record<string, unknown>;
  _meta: {
    /** Why a cached score was rejected, when it was. Diagnostic only. */
    invalidation_reason: string | null;
    /** Outcome of offering a freshly computed score to storage. */
    publish_reason: string | null;
    resolved_at: string;
  };
}

/**
 * Today's date for the requester.
 *
 * Uses the caller's declared zone when they provide one; otherwise UTC. The
 * server process timezone is never consulted, because which day "today" is must
 * not depend on where the server happens to run.
 */
function todayForRequest(timeZone: string | null): string {
  const now = new Date();
  const zone = timeZone ?? 'UTC';
  const parts = localPartsInZone(now, zone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NdsSuccessResponse | NdsErrorResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // A person's nutrition score is private and must never be cached by a shared
  // proxy or reused across a session change.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Vary', 'Cookie');

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return; // 401/403 already sent

    const personId = await resolveJournalTargetPerson(req, res, ctx);
    if (!personId) return; // 403 already sent

    const { date_local: dateParam, include_debug: debugParam } = req.query;
    const requestTimeZone = readRequestTimeZone(req.headers);

    // An explicitly supplied date must be a REAL date. Silently substituting
    // today for '2026-02-30' would answer a question nobody asked.
    let dateLocal: string;
    if (typeof dateParam === 'string' && dateParam.length > 0) {
      if (!isRealCalendarDate(dateParam)) {
        return res.status(400).json({ error: 'Invalid date_local. Use a real YYYY-MM-DD date.' });
      }
      dateLocal = dateParam;
    } else {
      dateLocal = todayForRequest(requestTimeZone);
    }

    const includeDebug = debugParam === 'true' && ctx.user.role === 'admin';

    const outcome = await resolveDailyNDS(createSupabaseNdsPersistence(), {
      personId,
      dateLocal,
      includeDebug,
    });

    if (outcome.state.state === 'unavailable') {
      // 503 rather than 200: this is a real failure to answer, and a client must
      // be able to tell it apart from a day with no food in it.
      return res.status(503).json({
        nds: outcome.state,
        _meta: {
          invalidation_reason: outcome.invalidationReason,
          publish_reason: outcome.publishReason,
          resolved_at: new Date().toISOString(),
        },
      });
    }

    const body: NdsSuccessResponse = {
      nds: outcome.state,
      _meta: {
        invalidation_reason: outcome.invalidationReason,
        publish_reason: outcome.publishReason,
        resolved_at: new Date().toISOString(),
      },
    };

    if (includeDebug && outcome.debugData) {
      body.debug_data = outcome.debugData;
    }

    return res.status(200).json(body);
  } catch (error) {
    // Log the detail; return a stable message. The previous handler echoed the
    // raw error to the client.
    console.error('[NDS API] Unexpected error:', error);
    return res.status(500).json({ error: 'Unable to resolve nutrition density score.' });
  }
}
