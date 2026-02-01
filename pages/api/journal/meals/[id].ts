/**
 * API Route: /api/journal/meals/[id]
 * 
 * GET: Get a single meal template by ID
 * PATCH: Update a meal template (name, items, nutritionDensity)
 * DELETE: Delete a meal template
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import {
  getPersonIdFromAuthUserId,
  getMealTemplate,
  updateMealTemplate,
  deleteMealTemplate,
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

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing template ID' });
  }

  try {
    if (req.method === 'GET') {
      const template = await getMealTemplate(personId, id);
      if (!template) {
        return res.status(404).json({ error: 'Meal template not found' });
      }
      return res.status(200).json({ template });
    }

    if (req.method === 'PATCH') {
      // Body: { name?: string, items?: [...], nutritionDensity?: number | null }
      const { name, items, nutritionDensity } = req.body || {};

      // Validate inputs if provided
      if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
        return res.status(400).json({ error: 'Name must be a non-empty string' });
      }
      if (items !== undefined && !Array.isArray(items)) {
        return res.status(400).json({ error: 'Items must be an array' });
      }

      const updated = await updateMealTemplate({
        personId,
        templateId: id,
        name: name?.trim(),
        items,
        nutritionDensity,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Meal template not found' });
      }

      return res.status(200).json({ template: updated });
    }

    if (req.method === 'DELETE') {
      await deleteMealTemplate(personId, id);
      return res.status(200).json({ success: true });
    }

    // Method not allowed
    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[API /journal/meals/[id]] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
