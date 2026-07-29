/**
 * GET    /api/journal/food/grocery-lists/:listId — list detail + items.
 * PATCH  /api/journal/food/grocery-lists/:listId — { action: 'rename' | 'archive' | 'unarchive', title?: string }.
 * DELETE /api/journal/food/grocery-lists/:listId — delete an empty, non-default, planless list.
 *
 * Auth: self-only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  archiveGroceryList,
  deleteGroceryList,
  getPersistentGroceryListDetail,
  GroceryListNotFoundError,
  GroceryListValidationError,
  GroceryListConflictError,
  renameGroceryList,
  unarchiveGroceryList,
} from '@/lib/plans/groceryListService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const listId = req.query.listId;
  if (typeof listId !== 'string' || !listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const { list, items } = await getPersistentGroceryListDetail(personId, listId);
      return res.status(200).json({ list, items });
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as { action?: unknown; title?: unknown };
      if (body.action === 'rename') {
        const list = await renameGroceryList(personId, listId, String(body.title ?? ''));
        return res.status(200).json({ list });
      }
      if (body.action === 'archive') {
        const list = await archiveGroceryList(personId, listId);
        return res.status(200).json({ list });
      }
      if (body.action === 'unarchive') {
        const list = await unarchiveGroceryList(personId, listId);
        return res.status(200).json({ list });
      }
      return res.status(400).json({ error: 'action must be one of rename, archive, unarchive.' });
    }

    await deleteGroceryList(personId, listId);
    return res.status(204).end();
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryListValidationError || err instanceof GroceryListConflictError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
