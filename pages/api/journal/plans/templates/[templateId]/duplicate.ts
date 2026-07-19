/**
 * POST /api/journal/plans/templates/:templateId/duplicate
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { duplicatePlanDayTemplate } from '@/lib/plans/planServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const templateId = req.query.templateId;
  if (typeof templateId !== 'string' || !templateId) {
    return res.status(400).json({ error: 'templateId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const template = await duplicatePlanDayTemplate(ctx.personId, templateId);
    return res.status(201).json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    console.error('[API /journal/plans/templates/:templateId/duplicate] error:', err);
    return res.status(500).json({ error: message });
  }
}
