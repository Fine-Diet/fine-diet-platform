/**
 * GET    /api/journal/plans/:planId  — plan + days + slots + meals
 * PATCH  /api/journal/plans/:planId  — update title/status/end_date
 * DELETE /api/journal/plans/:planId  — cascade delete
 *
 * Auth: three-step pattern. GET supports view-as-client.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  getPlanDetail,
  updatePlan,
  deletePlan,
} from '@/lib/plans/planServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planId = req.query.planId;
  if (typeof planId !== 'string' || !planId) {
    return res.status(400).json({ error: 'planId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return;
      const detail = await getPlanDetail(targetPersonId, planId);
      if (!detail) return res.status(404).json({ error: 'Plan not found' });
      return res.status(200).json(detail);
    }

    if (req.method === 'PATCH') {
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;
      const body = (req.body ?? {}) as {
        title?: string | null;
        status?: 'draft' | 'active' | 'archived';
        end_date?: string | null;
      };
      const plan = await updatePlan(personId, planId, body);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      return res.status(200).json({ plan });
    }

    if (req.method === 'DELETE') {
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;
      await deletePlan(personId, planId);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans/:planId] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
