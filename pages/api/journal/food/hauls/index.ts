/**
 * GET/POST /api/journal/food/hauls
 *
 * Packet 11E collection read plus Packet 2 multi-List create path.
 *
 * Returns lightweight presentation items for the Groceries landing Hauls
 * section and the /app/food/hauls collection page.
 *
 * GET is read-only. POST delegates atomic snapshot creation to the server
 * service and never accepts item snapshots or mutates Lists/Pantry/pricing.
 * Auth: self-only via requireJournalAccess.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { GroceryListNotFoundError } from '@/lib/plans/groceryListService';
import {
  GroceryHaulBlockedError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulValidationError,
  createGroceryHaulFromLists,
  listGroceryHaulsForPerson,
} from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const hauls = await listGroceryHaulsForPerson(personId);
      return res.status(200).json({ hauls });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (
      !Array.isArray(body.source_grocery_list_ids)
      || !body.source_grocery_list_ids.every((value) => typeof value === 'string')
    ) {
      return res.status(400).json({ error: 'source_grocery_list_ids must be an array of strings' });
    }

    const result = await createGroceryHaulFromLists({
      personId,
      listIds: body.source_grocery_list_ids as string[],
      shoppingDate: typeof body.shopping_date === 'string' ? body.shopping_date : '',
      creationToken: typeof body.creation_token === 'string' ? body.creation_token : '',
    });
    return res.status(result.outcome === 'created' ? 201 : 200).json({ haul: result });
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof GroceryHaulForbiddenError) {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof GroceryHaulBlockedError) {
      return res.status(409).json({ error: err.message, block_reason: err.blockReason });
    }
    if (err instanceof GroceryHaulConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/hauls] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
