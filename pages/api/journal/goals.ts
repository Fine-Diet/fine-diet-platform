/**
 * GET /api/journal/goals
 * 
 * Returns the authenticated user's daily calorie and macro goals.
 * Falls back to sensible defaults if user hasn't set custom goals.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId, getUserGoals } from '@/lib/journal/journalServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getCurrentUserWithRoleFromApi(req, res);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Resolve person_id
    const personId = await getPersonIdFromAuthUserId(user.id);
    if (!personId) {
      return res.status(403).json({ error: 'No person record found for this user' });
    }

    // Fetch goals
    const goals = await getUserGoals(personId);

    return res.status(200).json({ goals });
  } catch (error) {
    console.error('[API /api/journal/goals] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
