import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryHaulBlockedError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  startGroceryHaulExecution,
} from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = req.query.haulId;
  if (typeof haulId !== 'string' || !haulId) {
    return res.status(400).json({ error: 'haulId is required' });
  }
  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const execution = await startGroceryHaulExecution({
      personId: ctx.personId,
      haulId,
    });
    return res.status(200).json({ execution });
  } catch (err) {
    if (err instanceof GroceryHaulNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulForbiddenError) {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof GroceryHaulValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof GroceryHaulBlockedError || err instanceof GroceryHaulConflictError) {
      return res.status(409).json({
        error: err.message,
        ...(err instanceof GroceryHaulBlockedError ? { block_reason: err.blockReason } : {}),
      });
    }
    console.error('[API /journal/food/hauls/:haulId/execution/start] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
