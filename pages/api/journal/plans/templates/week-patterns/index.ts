/**
 * GET /api/journal/plans/templates/week-patterns
 * POST /api/journal/plans/templates/week-patterns
 *
 * Packet 56 — reusable multi-day/week pattern snapshots are stored in
 * dedicated table-backed storage, not as aliases to source plan rows.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  listPlanWeekPatterns,
  savePlanWeekPattern,
} from '@/lib/plans/planServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const patterns = await listPlanWeekPatterns(personId);
      return res.status(200).json({ patterns });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        plan_id?: unknown;
        source_plan_day_ids?: unknown;
        name?: unknown;
      };
      const planId = typeof body.plan_id === 'string' ? body.plan_id : null;
      const sourcePlanDayIds = Array.isArray(body.source_plan_day_ids)
        ? body.source_plan_day_ids.filter((id): id is string => typeof id === 'string')
        : [];
      const name = typeof body.name === 'string' ? body.name : null;

      if (!planId || sourcePlanDayIds.length === 0) {
        return res.status(400).json({
          error: 'plan_id and source_plan_day_ids are required.',
        });
      }

      const pattern = await savePlanWeekPattern({
        personId,
        planId,
        sourcePlanDayIds,
        name,
      });
      return res.status(201).json({ pattern });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans/templates/week-patterns] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}
