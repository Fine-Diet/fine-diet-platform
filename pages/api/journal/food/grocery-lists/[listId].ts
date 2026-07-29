/**
 * Persistent Grocery List detail API — /api/journal/food/grocery-lists/:listId
 *
 * GET    — Fetch a list (default or named) + its items. Ownership-scoped by
 *          owner_id, so this 404s for lists not owned by the caller.
 * PATCH  — { action: 'rename', title } | { action: 'archive' } |
 *          { action: 'unarchive' }
 * DELETE — Only allowed for a non-default, planless, empty named list.
 *
 * Plan-derived lists (plan_id set) are returned as-is by GET so the client
 * can redirect to the rich plan-scoped experience; PATCH/DELETE reject them.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  archiveGroceryList,
  deleteGroceryList,
  getPersistentGroceryListDetail,
  GroceryListConflictError,
  GroceryListNotFoundError,
  GroceryListValidationError,
  renameGroceryList,
  unarchiveGroceryList,
} from '@/lib/plans/groceryListService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const listId = req.query.listId;
  if (typeof listId !== 'string' || !listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const result = await getPersistentGroceryListDetail(personId, listId);
      return res.status(200).json(result);
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as { action?: unknown; title?: unknown };

      if (body.action === 'rename') {
        const list = await renameGroceryList(personId, listId, body.title);
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
      return res.status(400).json({ error: 'Unsupported action.' });
    }

    if (req.method === 'DELETE') {
      await deleteGroceryList(personId, listId);
      return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryListValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof GroceryListConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
