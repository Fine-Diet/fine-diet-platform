/**
 * GET /api/journal/food/grocery-lists/:listId/purchasing-choices
 *
 * Read-only map of list-scoped purchasing choices for a durable list.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  getPersistentGroceryListDetail,
  GroceryListNotFoundError,
} from '@/lib/plans/groceryListService';
import { getListPurchasingChoicesBundle } from '@/lib/plans/groceryListPurchasingChoiceService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const listId = req.query.listId;
  if (typeof listId !== 'string' || !listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    const { list } = await getPersistentGroceryListDetail(personId, listId);
    if (list.plan_id) {
      return res.status(400).json({
        error: 'Purchasing choices are for durable (planless) lists only.',
      });
    }

    const by_item_id = await getListPurchasingChoicesBundle(personId, listId);
    return res.status(200).json({ by_item_id });
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId/purchasing-choices] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
