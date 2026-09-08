import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  getGroceryHaulExecution,
} from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = req.query.haulId;
  if (typeof haulId !== 'string' || !haulId) {
    return res.status(400).json({ error: 'haulId is required' });
  }
  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    return res.status(200).json(await getGroceryHaulExecution(ctx.personId, haulId));
  } catch (err) {
    if (err instanceof GroceryHaulNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/hauls/:haulId/execution] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
