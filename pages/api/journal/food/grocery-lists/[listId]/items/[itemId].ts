/**
 * PATCH  /api/journal/food/grocery-lists/:listId/items/:itemId — update
 *   name/quantity/unit/notes/status on a persistent-list item.
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
      const item = await updateGroceryListItem(personId, listId, itemId, body);
      return res.status(200).json({ item });
    }

    await deleteGroceryListItem(personId, listId, itemId);
    return res.status(204).end();
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryListValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId/items/:itemId] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
