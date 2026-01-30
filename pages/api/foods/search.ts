/**
 * GET /api/foods/search?q=query
 * 
 * Search foods by text query.
 * Returns grouped results (Your Foods, Branded, Common) with slotting.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { searchFoods } from '@/lib/food/foodServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 20;

    // Try to get authenticated user (search works for both auth'd and anon)
    let personId: string | null = null;
    try {
      const user = await getCurrentUserWithRoleFromApi(req, res);
      if (user) {
        personId = await getPersonIdFromAuthUserId(user.id);
      }
    } catch {
      // Anonymous user - that's fine for search
    }

    const results = await searchFoods(query, personId, { limit });

    return res.status(200).json(results);
  } catch (error) {
    console.error('[API /api/foods/search] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
