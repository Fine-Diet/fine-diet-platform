/**
 * GET /api/journal/food/grocery-lists/:listId/haul-summary
 *
 * Read-only Full Haul Estimate for a persistent (planless) grocery list.
 * Prices resolve via each item's plan+date provenance — no data mutation.
 *
 * Auth: self-only via requireJournalAccess.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  getPersistentGroceryListDetail,
  GroceryListNotFoundError,
} from '@/lib/plans/groceryListService';
import { getGroceryHaulSummaryForList } from '@/lib/plans/groceryPriceServerService';

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
        error: 'Use the plan grocery haul-summary route for plan-scoped lists.',
      });
    }

    const bundle = await getGroceryHaulSummaryForList({
      personId,
      groceryListId: listId,
    });
    return res.status(200).json(bundle);
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId/haul-summary] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
