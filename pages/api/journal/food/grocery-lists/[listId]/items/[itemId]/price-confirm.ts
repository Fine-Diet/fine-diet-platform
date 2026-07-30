/**
 * POST /api/journal/food/grocery-lists/:listId/items/:itemId/price-confirm
 * Confirm a sourced offer into grocery_list_price_observations.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { GroceryListPriceValidationError } from '@/lib/plans/groceryListPriceObservationService';
import { confirmListGroceryItemPrice } from '@/lib/plans/groceryListPriceSearchService';
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
    const result = await confirmListGroceryItemPrice({
      personId: ctx.personId,
      listId,
      itemId,
      input: {
        search_event_id: typeof body.search_event_id === 'string' ? body.search_event_id : '',
        provider_result_id:
          typeof body.provider_result_id === 'string' ? body.provider_result_id : '',
        package_count: body.package_count as number | undefined,
        replace_manual: body.replace_manual === true,
      },
    });
    return res.status(201).json(result);
  } catch (err) {
    if (
      err instanceof GroceryListPriceValidationError ||
      err instanceof GroceryPriceValidationError
    ) {
      return res.status(400).json({ error: err.message });
    }
    console.error(
      '[API /journal/food/grocery-lists/:listId/items/:itemId/price-confirm] error:',
      err,
    );
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
