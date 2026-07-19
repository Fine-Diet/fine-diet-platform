/**
 * GET /api/journal/plans/templates
 * POST /api/journal/plans/templates
 *
 * Packet 56 — save/list reusable plan-day templates from dedicated snapshot
 * storage so they are not live aliases to planned_meals rows.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  createBlankPlanDayTemplate,
  listPlanDayTemplates,
  savePlanDayAsTemplate,
} from '@/lib/plans/planServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const templates = await listPlanDayTemplates(personId);
      return res.status(200).json({ templates });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        plan_id?: unknown;
        plan_day_id?: unknown;
        name?: unknown;
        include_meals?: unknown;
        mode?: unknown;
      };
      const mode = typeof body.mode === 'string' ? body.mode : null;
      const name = typeof body.name === 'string' ? body.name : null;

      if (mode === 'blank') {
        const template = await createBlankPlanDayTemplate({ personId, name });
        return res.status(201).json({ template });
      }

      const planId = typeof body.plan_id === 'string' ? body.plan_id : null;
      const planDayId = typeof body.plan_day_id === 'string' ? body.plan_day_id : null;
      const includeMeals = body.include_meals !== false;

      if (!planId || !planDayId) {
        return res.status(400).json({ error: 'plan_id and plan_day_id are required.' });
      }

      const template = await savePlanDayAsTemplate({
        personId,
        planId,
        planDayId,
        name,
        includeMeals,
      });
      return res.status(201).json({ template });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans/templates] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
