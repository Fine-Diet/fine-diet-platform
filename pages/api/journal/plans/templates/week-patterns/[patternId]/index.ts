/**
 * GET/PATCH/DELETE /api/journal/plans/templates/week-patterns/:patternId
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  deletePlanWeekPattern,
  getPlanWeekPattern,
  updatePlanWeekPattern,
} from '@/lib/plans/planServerService';
import {
  normalizeWeekPatternPatchBody,
  ReusablePatchValidationError,
} from '@/lib/plans/reusablePatchValidation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const patternId = req.query.patternId;
  if (typeof patternId !== 'string' || !patternId) {
    return res.status(400).json({ error: 'patternId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const pattern = await getPlanWeekPattern(personId, patternId);
      if (!pattern) return res.status(404).json({ error: 'Plan week pattern not found.' });
      return res.status(200).json({ pattern });
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      let patch;
      try {
        patch = normalizeWeekPatternPatchBody(body);
      } catch (err) {
        if (err instanceof ReusablePatchValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
      const pattern = await updatePlanWeekPattern({
        personId,
        patternId,
        ...patch,
      });
      return res.status(200).json({ pattern });
    }

    if (req.method === 'DELETE') {
      await deletePlanWeekPattern(personId, patternId);
      return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    console.error('[API /journal/plans/templates/week-patterns/:patternId] error:', err);
    return res.status(500).json({ error: message });
  }
}
