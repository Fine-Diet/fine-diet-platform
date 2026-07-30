/**
 * PATCH  /api/journal/food/grocery-lists/:listId/items/:itemId — update
 *   name/quantity/unit/notes/status, or list-scoped resolve actions.
 * DELETE /api/journal/food/grocery-lists/:listId/items/:itemId — remove
 *   an item (manual or generated contribution) from the list.
 *
 * Auth: self-only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  deleteGroceryListItem,
  GroceryListNotFoundError,
  GroceryListValidationError,
  updateGroceryListItem,
} from '@/lib/plans/groceryListService';
import {
  clearGroceryItemListChoice,
  GroceryListPurchasingChoiceValidationError,
  resolveGroceryItemForList,
} from '@/lib/plans/groceryListPurchasingChoiceService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', ['PATCH', 'DELETE']);
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
    const { personId } = ctx;

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const action = typeof body.action === 'string' ? body.action : null;

      if (action === 'resolve_for_list') {
        const foodObjectId = typeof body.food_object_id === 'string' ? body.food_object_id : '';
        if (!foodObjectId) {
          return res.status(400).json({ error: 'food_object_id is required.' });
        }
        const result = await resolveGroceryItemForList({
          personId,
          listId,
          itemId,
          foodObjectId,
          rememberForFuture: body.remember_for_future === true,
          saveToSourcePlan: body.save_to_source_plan === true,
          asPurchasedSubstitution: body.as_purchased_substitution === true,
          preferredProduct:
            typeof body.preferred_product === 'string' ? body.preferred_product : null,
          note: typeof body.note === 'string' ? body.note : null,
        });
        return res.status(200).json(result);
      }

      if (action === 'clear_list_choice') {
        const result = await clearGroceryItemListChoice({ personId, listId, itemId });
        return res.status(200).json(result);
      }

      const item = await updateGroceryListItem(personId, listId, itemId, body);
      return res.status(200).json({ item });
    }

    await deleteGroceryListItem(personId, listId, itemId);
    return res.status(204).end();
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (
      err instanceof GroceryListValidationError ||
      err instanceof GroceryListPurchasingChoiceValidationError
    ) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId/items/:itemId] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
