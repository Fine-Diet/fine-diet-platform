/**
 * GET/PATCH/DELETE /api/journal/plans/templates/:templateId
 *
 * Authoring CRUD for reusable day-template snapshots. Updates never mutate
 * previously dated plans — only the snapshot row in reusable_plan_day_templates.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  deletePlanDayTemplate,
  getPlanDayTemplate,
  updatePlanDayTemplate,
} from '@/lib/plans/planServerService';
import { normalizeTemplatePatchBody, ReusablePatchValidationError } from '@/lib/plans/reusablePatchValidation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const templateId = req.query.templateId;
  if (typeof templateId !== 'string' || !templateId) {
    return res.status(400).json({ error: 'templateId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const template = await getPlanDayTemplate(personId, templateId);
      if (!template) return res.status(404).json({ error: 'Plan day template not found.' });
      return res.status(200).json({ template });
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      let patch;
      try {
        patch = normalizeTemplatePatchBody(body);
      } catch (err) {
        if (err instanceof ReusablePatchValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
      const template = await updatePlanDayTemplate({
        personId,
        templateId,
        ...patch,
      });
      return res.status(200).json({ template });
    }

    if (req.method === 'DELETE') {
      await deletePlanDayTemplate(personId, templateId);
      return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    console.error('[API /journal/plans/templates/:templateId] error:', err);
    return res.status(500).json({ error: message });
  }
}
