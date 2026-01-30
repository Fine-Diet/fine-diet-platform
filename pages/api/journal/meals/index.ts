/**
 * API Route: /api/journal/meals
 * 
 * GET: List all meal templates for the user
 * POST: Create a new meal template
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import {
  getPersonIdFromAuthUserId,
  createMealTemplate,
  listMealTemplates,
} from '@/lib/journal/journalServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get person_id from auth user
  const personId = await getPersonIdFromAuthUserId(user.id);
  if (!personId) {
    return res.status(403).json({ error: 'No person record found. Please contact support.' });
  }

  try {
    if (req.method === 'GET') {
      const templates = await listMealTemplates(personId);
      return res.status(200).json({ templates });
    }

    if (req.method === 'POST') {
      // Body: { name: string, items: [...], nutritionDensity?: number }
      const { name, items, nutritionDensity } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Missing required field: name' });
      }

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Missing required field: items (array)' });
      }

      const template = await createMealTemplate({
        personId,
        name,
        items,
        nutritionDensity,
      });

      return res.status(201).json({ template });
    }

    // Method not allowed
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[API /journal/meals] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
