/**
 * API Route: /api/journal/meals/[id]
 * 
 * GET: Get a single meal template by ID
 * PATCH: Update a meal template (name, items, nutritionDensity)
 * DELETE: Delete a meal template
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, resolveJournalTargetPerson, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  getMealTemplate,
  updateMealTemplate,
  deleteMealTemplate,
} from '@/lib/journal/journalServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user (journal access checked per-branch below)
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return; // 401 or 403 already sent

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing template ID' });
  }

  try {
    if (req.method === 'GET') {
      // Resolve target person (checks journal access for self or client)
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return; // 403 already sent

      const template = await getMealTemplate(targetPersonId, id);
      if (!template) {
        return res.status(404).json({ error: 'Meal template not found' });
      }
      return res.status(200).json({ template });
    }

    // Writes are always self-only — require caller journal access
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

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
