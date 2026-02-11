/**
 * API Route: /api/journal/meals
 * 
 * GET: List all meal templates for the user
 * POST: Create a new meal template
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, resolveJournalTargetPerson, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  createMealTemplate,
  listMealTemplates,
} from '@/lib/journal/journalServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user (journal access checked per-branch below)
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return; // 401 or 403 already sent

  try {
    if (req.method === 'GET') {
      // Resolve target person (checks journal access for self or client)
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return; // 403 already sent

      const templates = await listMealTemplates(targetPersonId);
      return res.status(200).json({ templates });
    }

    if (req.method === 'POST') {
      // Writes are always self-only — require caller journal access
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;

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
