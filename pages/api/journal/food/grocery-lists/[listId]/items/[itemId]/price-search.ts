/**
 * POST /api/journal/food/grocery-lists/:listId/items/:itemId/price-search
 * List-scoped SerpAPI Find Price search (writes search events; not Stage-1 observations).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { GroceryListPriceValidationError } from '@/lib/plans/groceryListPriceObservationService';
import { searchListGroceryItemPrices } from '@/lib/plans/groceryListPriceSearchService';
import {
  GroceryPriceQuotaExceededError,
} from '@/lib/plans/groceryPriceQuota';
import { GroceryPriceValidationError } from '@/lib/plans/groceryPricingValidation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const listId = req.query.listId;
  const itemId = req.query.itemId;
  if (typeof listId !== 'string' || !listId || typeof itemId !== 'string' || !itemId) {
    return res.status(400).json({ error: 'listId and itemId are required' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const retailer = typeof body.retailer === 'string' ? body.retailer : '';
    const postalCode = typeof body.postal_code === 'string' ? body.postal_code : '';
    const result = await searchListGroceryItemPrices({
      personId: ctx.personId,
      listId,
      itemId,
      retailer,
      postalCode,
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof GroceryPriceQuotaExceededError) {
      return res.status(429).json({ error: err.message, quota: err.quota });
    }
    if (
      err instanceof GroceryListPriceValidationError ||
      err instanceof GroceryPriceValidationError
    ) {
      return res.status(400).json({ error: err.message });
    }
    console.error(
      '[API /journal/food/grocery-lists/:listId/items/:itemId/price-search] error:',
      err,
    );
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
