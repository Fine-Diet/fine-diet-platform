/**
 * POST /api/journal/plans/grocery-items/:itemId/price-search
 *
 * Stage 1 — Search retail prices for a grocery item.
 *
 * Body:
 *   { retailer: string, postal_code: string }
 *
 * Response:
 *   GroceryPriceSearchResult
 *
 * Auth: self-only writes via requireJournalAuth + requireCallerJournalAccess.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  GroceryPriceQuotaExceededError,
  GroceryPriceValidationError,
  searchGroceryItemPrices,
} from '@/lib/plans/groceryPriceServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const itemId = req.query.itemId;
  if (typeof itemId !== 'string' || !itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const body = (req.body ?? {}) as { retailer?: unknown; postal_code?: unknown };
  if (typeof body.retailer !== 'string' || !body.retailer.trim()) {
    return res.status(400).json({ error: 'retailer is required' });
  }
  if (typeof body.postal_code !== 'string' || !body.postal_code.trim()) {
    return res.status(400).json({ error: 'postal_code is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const result = await searchGroceryItemPrices({
      personId: ctx.personId,
      groceryItemId: itemId,
      retailer: body.retailer,
      postalCode: body.postal_code,
    });
    if (result.outcome === 'provider_error') {
      return res.status(502).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof GroceryPriceValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof GroceryPriceQuotaExceededError) {
      return res.status(429).json({ error: error.message, quota: error.quota });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('[API /journal/plans/grocery-items/:itemId/price-search] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
