/**
 * GET/PATCH /api/journal/food/hauls/:haulId
 *
 * Canonical Haul preparation read and owner-scoped Draft metadata autosave.
 *
 * Auth: self-only via requireJournalAccess.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  getGroceryHaulDetail,
  updateGroceryHaulMetadata,
} from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PATCH'].includes(req.method ?? '')) {
    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const haulId = req.query.haulId;
  if (typeof haulId !== 'string' || !haulId) {
    return res.status(400).json({ error: 'haulId is required' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (
        (body.title !== undefined && typeof body.title !== 'string')
        || (body.shopping_date !== undefined && typeof body.shopping_date !== 'string')
        || (
          body.budget_amount !== undefined
          && body.budget_amount !== null
          && typeof body.budget_amount !== 'number'
        )
        || (body.currency !== undefined && typeof body.currency !== 'string')
      ) {
        return res.status(400).json({ error: 'Invalid Haul metadata patch.' });
      }
      const haul = await updateGroceryHaulMetadata({
        personId,
        haulId,
        title: body.title as string | undefined,
        shoppingDate: body.shopping_date as string | undefined,
        budgetAmount: body.budget_amount as number | null | undefined,
        currency: body.currency as string | undefined,
      });
      return res.status(200).json({ haul });
    }

    const detail = await getGroceryHaulDetail(personId, haulId);
    return res.status(200).json(detail);
  } catch (err) {
    if (err instanceof GroceryHaulNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof GroceryHaulConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/hauls/:haulId] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
