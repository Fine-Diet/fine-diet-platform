/**
 * GET /api/log/search
 *
 * Read-only Log Builder search across the parallel banks: Foods (existing food
 * search, unchanged), Meals, Recipes, and Recent. This is an ADDITIVE endpoint
 * for the future Log Builder (`/app/log/new`) Search and Library modes — it
 * does NOT replace or modify `/api/foods/search`, which current consumers keep
 * using as-is.
 *
 * Query params:
 *   - q            Search query. Empty/short ⇒ Foods bank empty (food search
 *                  needs ≥2 chars) while Meals/Recipes/Recent still list
 *                  (Library browse).
 *   - limit        Overall max results (default 50).
 *   - sectionLimit Max results per bank/section (default 12).
 *   - banks        Comma list of banks to include: foods,meals,recipes,recent
 *                  (default all four).
 *   - debug        Include diagnostics (dev only).
 *   - person_id    Optional staff "view-as-client" (read-only), enforced by
 *                  journal access.
 *
 * Auth: journal access required (authenticated app surface). No cross-person
 * reads beyond what journal access permits.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { logSearch } from '@/lib/logSearch/logSearchServerService';
import type { LogSearchBankKey } from '@/lib/logSearch/types';

const VALID_BANKS: LogSearchBankKey[] = ['foods', 'meals', 'recipes', 'recent'];

function parseBanks(raw: string | undefined): LogSearchBankKey[] | undefined {
  if (!raw) return undefined;
  const requested = raw
    .split(',')
    .map((b) => b.trim().toLowerCase())
    .filter((b): b is LogSearchBankKey => VALID_BANKS.includes(b as LogSearchBankKey));
  return requested.length > 0 ? requested : undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return; // 401/403 already sent

    const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
    if (!targetPersonId) return; // 403 already sent

    const query = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || undefined;
    const sectionLimit = parseInt(req.query.sectionLimit as string) || undefined;
    const banks = parseBanks(req.query.banks as string | undefined);

    const debug =
      req.query.debug === 'true' ||
      (process.env.NODE_ENV !== 'production' && process.env.SEARCH_DEBUG === 'true');

    const sessionId = (req.headers['x-session-id'] as string) || null;
    const pageContext = (req.query.pageContext as string) || 'log_builder';

    const result = await logSearch(query, targetPersonId, {
      limit,
      sectionLimit,
      banks,
      debug,
      sessionId,
      pageContext,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[API /api/log/search] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
