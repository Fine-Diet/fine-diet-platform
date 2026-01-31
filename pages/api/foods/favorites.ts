/**
 * API Route: Food Favorites
 * 
 * GET /api/foods/favorites - List all favorited foods for the authenticated user
 * POST /api/foods/favorites - Toggle or set favorite status
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { listFavorites, setFavorite, toggleFavorite } from '@/lib/food/foodServerService';

// Schema for POST body
const SetFavoriteSchema = z.object({
  foodObjectId: z.string().uuid('Invalid food ID'),
  isFavorite: z.boolean().optional(), // If omitted, toggles
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const personId = await getPersonIdFromAuthUserId(user.id);
  if (!personId) {
    return res.status(403).json({ error: 'No person profile linked to this account' });
  }

  // GET: List favorites
  if (req.method === 'GET') {
    try {
      const foods = await listFavorites(personId);
      return res.status(200).json({ foods });
    } catch (error) {
      console.error('[GET /api/foods/favorites] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch favorites' });
    }
  }

  // POST: Toggle or set favorite
  if (req.method === 'POST') {
    try {
      const parseResult = SetFavoriteSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ error: 'Validation failed', errors });
      }

      const { foodObjectId, isFavorite } = parseResult.data;

      let newValue: boolean;
      if (typeof isFavorite === 'boolean') {
        // Set explicit value
        newValue = await setFavorite(personId, foodObjectId, isFavorite);
      } else {
        // Toggle
        newValue = await toggleFavorite(personId, foodObjectId);
      }

      return res.status(200).json({ isFavorite: newValue, foodObjectId });
    } catch (error) {
      console.error('[POST /api/foods/favorites] Error:', error);
      return res.status(500).json({ error: 'Failed to update favorite' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
