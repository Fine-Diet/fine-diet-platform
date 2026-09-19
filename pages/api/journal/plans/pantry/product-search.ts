/**
 * POST /api/journal/plans/pantry/product-search
 *
 * SerpAPI-backed retail lookup for Pantry acquisition product details.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryPriceQuotaExceededError,
  PantryProductSearchLocationError,
  PantryProductSearchValidationError,
  searchPantryProductDetails,
} from '@/lib/plans/pantryProductSearchService';

export const config = {
  maxDuration: 30,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body ?? {}) as {
    query?: unknown;
    postal_code?: unknown;
    retailer?: unknown;
  };
  if (typeof body.query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  if (typeof body.postal_code !== 'string' || !body.postal_code.trim()) {
    return res.status(400).json({ error: 'postal_code is required' });
  }

  const retailer =
    body.retailer == null || typeof body.retailer === 'string'
      ? body.retailer ?? null
      : null;
  if (body.retailer != null && typeof body.retailer !== 'string') {
    return res.status(400).json({ error: 'retailer must be a string when provided' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;

    const result = await searchPantryProductDetails({
      personId: ctx.personId,
      query: body.query,
      postal_code: body.postal_code,
      retailer,
    });
    if (result.outcome === 'provider_error') {
      return res.status(502).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof PantryProductSearchValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof PantryProductSearchLocationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof GroceryPriceQuotaExceededError) {
      return res.status(429).json({ error: error.message, quota: error.quota });
    }
    console.error('[API /journal/plans/pantry/product-search] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
