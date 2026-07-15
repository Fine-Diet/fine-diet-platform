/**
 * PATCH /api/journal/plans/grocery-shopping-overrides/:overrideId
 *
 * Packet 3 — retire an unmatched shopping override.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { clearUnmatchedShoppingOverride } from '@/lib/plans/groceryShoppingOverrideService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const overrideId = req.query.overrideId;
  if (typeof overrideId !== 'string' || !overrideId) {
    return res.status(400).json({ error: 'overrideId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const body = (req.body ?? {}) as { action?: unknown };
    if (body.action !== 'retire') {
      return res.status(400).json({ error: 'action must be retire' });
    }

    const shopping_override = await clearUnmatchedShoppingOverride({
      personId: ctx.personId,
      overrideId,
    });
    return res.status(200).json({ shopping_override });
  } catch (err) {
    console.error('[API /journal/plans/grocery-shopping-overrides/:overrideId PATCH] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
