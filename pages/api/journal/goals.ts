/**
 * GET /api/journal/goals
 * 
 * Returns the authenticated user's daily calorie and macro goals.
 * Falls back to sensible defaults if user hasn't set custom goals.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, resolveJournalTargetPerson } from '@/lib/access/requireJournalAccess';
import { getUserGoals } from '@/lib/journal/journalServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user (journal access checked by resolveJournalTargetPerson)
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return; // 401 or 403 already sent

    // Resolve target person (supports ?person_id= for staff view-as-client)
    const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
    if (!targetPersonId) return; // 403 already sent

    // Fetch goals
    const goals = await getUserGoals(targetPersonId);

    return res.status(200).json({ goals });
  } catch (error) {
    console.error('[API /api/journal/goals] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
