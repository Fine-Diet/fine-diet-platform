import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import { buildBlankTemplateSlotsFromSchedule } from '@/lib/plans/planServerService';

/** Read-only seed for a new date-agnostic Day Plan browser draft. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const slots = await buildBlankTemplateSlotsFromSchedule(ctx.personId);
    return res.status(200).json({ person_id: ctx.personId, slots });
  } catch (error) {
    console.error('[API /journal/plans/templates/seed] error:', error);
    return res.status(500).json({ error: 'Could not prepare a Day Plan draft.' });
  }
}
