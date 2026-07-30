/**
 * POST /api/journal/food/grocery-lists/:listId/items/:itemId/price-manual
 * Save a list-scoped estimated price for a durable grocery row.
 *
 * Auth: self-only. Does not write Stage-1 plan+date observations.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryListPriceValidationError,
  saveManualListGroceryPrice,
} from '@/lib/plans/groceryListPriceObservationService';

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
    const observation = await saveManualListGroceryPrice({
      personId: ctx.personId,
      listId,
      itemId,
      input: {
        unit_price: body.unit_price,
        package_count: body.package_count,
        currency: body.currency,
        product_title: body.product_title,
        brand_name: body.brand_name,
        retailer: body.retailer,
        postal_code: body.postal_code,
        package_size: body.package_size,
        package_unit: body.package_unit,
      },
    });
    return res.status(201).json({ observation });
  } catch (err) {
    if (err instanceof GroceryListPriceValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error(
      '[API /journal/food/grocery-lists/:listId/items/:itemId/price-manual] error:',
      err,
    );
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
