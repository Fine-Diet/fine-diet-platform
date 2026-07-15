/**
 * POST /api/journal/plans/grocery-items/:itemId/price-manual
 *
 * Stage 1 — Save a manual grocery price observation.
 *
 * Body:
 *   SaveManualGroceryPriceInput (grocery_item_id inferred from route)
 *
 * Response:
 *   { observation: GroceryPriceObservation }
 *
 * Auth: self-only writes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  GroceryPriceValidationError,
  saveManualGroceryPrice,
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

  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const observation = await saveManualGroceryPrice({
      personId: ctx.personId,
      input: {
        grocery_item_id: itemId,
        retailer: body.retailer as string | null | undefined,
        postal_code: body.postal_code as string | null | undefined,
        product_title: body.product_title as string | null | undefined,
        brand_name: body.brand_name as string | null | undefined,
        package_size: body.package_size as number | null | undefined,
        package_unit: body.package_unit as string | null | undefined,
        unit_price: body.unit_price as number,
        currency: body.currency as string | undefined,
        package_count: body.package_count as number | undefined,
        product_url: body.product_url as string | null | undefined,
        image_url: body.image_url as string | null | undefined,
      },
    });
    return res.status(200).json({ observation });
  } catch (error) {
    if (error instanceof GroceryPriceValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof Error && error.message.includes('sourced grocery price')) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('[API /journal/plans/grocery-items/:itemId/price-manual] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
