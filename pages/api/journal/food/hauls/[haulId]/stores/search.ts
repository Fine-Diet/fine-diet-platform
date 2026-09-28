/**
 * POST /api/journal/food/hauls/:haulId/stores/search
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { GroceryHaulNotFoundError, getGroceryHaulDetail, searchGroceryHaulStores } from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = req.query.haulId;
  if (typeof haulId !== 'string' || !haulId) {
    return res.status(400).json({ error: 'haulId is required' });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 2) {
    return res.status(400).json({ error: 'query must be at least 2 characters.' });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;

  try {
    await getGroceryHaulDetail(ctx.personId, haulId);
    const locationContext =
      typeof body.location_context === 'string' ? body.location_context : null;
    const result = await searchGroceryHaulStores({ query, locationContext });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof GroceryHaulNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error('[API /journal/food/hauls/:haulId/stores/search] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
