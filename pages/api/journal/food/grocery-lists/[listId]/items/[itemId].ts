/**
 * PATCH/DELETE /api/journal/food/grocery-lists/:listId/items/:itemId
 *
 * Edit, check off, or remove a single item on a persistent (planless)
 * grocery list. Plan-derived list items are managed exclusively through
 * /api/journal/plans/grocery-items/:itemId — untouched by this file.
 *
 * PATCH body: any of { name?, quantity?, unit?, notes?, status? }
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
  const listId = req.query.listId;
  const itemId = req.query.itemId;
  if (typeof listId !== 'string' || !listId) {
    return res.status(400).json({ error: 'listId is required' });
  }
  if (typeof itemId !== 'string' || !itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        name?: unknown;
        quantity?: unknown;
        unit?: unknown;
        notes?: unknown;
        status?: unknown;
      };
      const item = await updateGroceryListItem(personId, listId, itemId, body);
      return res.status(200).json({ item });
    }

    if (req.method === 'DELETE') {
      await deleteGroceryListItem(personId, listId, itemId);
      return res.status(204).end();
    }

    res.setHeader('Allow', ['PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
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
