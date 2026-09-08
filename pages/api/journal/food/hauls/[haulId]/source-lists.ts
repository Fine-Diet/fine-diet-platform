/**
 * POST /api/journal/food/hauls/:haulId/source-lists
 *
 * Atomically adds one or more active same-owner Lists to an existing Draft.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { GroceryListNotFoundError } from '@/lib/plans/groceryListService';
import {
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  addGroceryListsToDraftHaul,
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
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (
    !Array.isArray(body.source_grocery_list_ids)
    || !body.source_grocery_list_ids.every((value) => typeof value === 'string')
  ) {
    return res.status(400).json({ error: 'source_grocery_list_ids must be an array of strings' });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;
  try {
    const result = await addGroceryListsToDraftHaul({
      personId: ctx.personId,
      haulId,
      listIds: body.source_grocery_list_ids as string[],
    });
    return res.status(200).json({ result });
  } catch (err) {
    if (err instanceof GroceryHaulNotFoundError || err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof GroceryHaulForbiddenError) {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof GroceryHaulConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/hauls/:haulId/source-lists] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
