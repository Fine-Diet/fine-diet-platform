/**
 * GET /api/journal/plans/imports/meals
 *
 * Phase 4: list imported recipe/meal drafts for the authenticated
 * person, ordered newest-updated first. Read-only.
 *
 * Auth: journal access required. No cross-person reads.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { listImportedMeals } from '@/lib/plans/importsServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
    if (!targetPersonId) return;

    const imports = await listImportedMeals(targetPersonId);
    return res.status(200).json({ imported_meals: imports });
  } catch (err) {
    console.error('[API /journal/plans/imports/meals GET] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
