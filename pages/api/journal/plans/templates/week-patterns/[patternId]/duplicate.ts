/**
 * POST /api/journal/plans/templates/week-patterns/:patternId/duplicate
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { duplicatePlanWeekPattern } from '@/lib/plans/planServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const patternId = req.query.patternId;
  if (typeof patternId !== 'string' || !patternId) {
    return res.status(400).json({ error: 'patternId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const pattern = await duplicatePlanWeekPattern(ctx.personId, patternId);
    return res.status(201).json({ pattern });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    console.error('[API /journal/plans/templates/week-patterns/:patternId/duplicate] error:', err);
    return res.status(500).json({ error: message });
  }
}
