/**
 * DELETE /api/journal/food/hauls/:haulId/stores/:storeId
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  removeGroceryHaulStore,
} from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = req.query.haulId;
  const storeId = req.query.storeId;
  if (typeof haulId !== 'string' || !haulId || typeof storeId !== 'string' || !storeId) {
    return res.status(400).json({ error: 'haulId and storeId are required' });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;

  try {
    const result = await removeGroceryHaulStore({
      personId: ctx.personId,
      haulId,
      storeId,
    });
    return res.status(200).json({ result });
  } catch (err) {
    if (err instanceof GroceryHaulNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/hauls/:haulId/stores/:storeId] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
