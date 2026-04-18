/**
 * GET /api/journal/plans/:planId/days/:date — plan day + slots + meals
 *
 * View-as-client supported via ?person_id=.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  getPlanDayByDate,
  listSlotsForDay,
  listMealsForDay,
} from '@/lib/plans/planServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planId = req.query.planId;
  const date = req.query.date;
  if (typeof planId !== 'string' || !planId) {
    return res.status(400).json({ error: 'planId is required' });
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
    if (!targetPersonId) return;

    const day = await getPlanDayByDate(targetPersonId, planId, date);
    if (!day) return res.status(404).json({ error: 'Plan day not found' });

    const [slots, meals] = await Promise.all([
      listSlotsForDay(targetPersonId, day.id),
      listMealsForDay(targetPersonId, day.id),
    ]);

    return res.status(200).json({ day, slots, meals });
  } catch (err) {
    console.error('[API /journal/plans/:planId/days/:date] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
