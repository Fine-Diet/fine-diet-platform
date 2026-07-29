/**
 * GET  /api/journal/food/grocery-lists — overview of the caller's grocery
 *   lists: the default "My Grocery List", named lists, archived lists, and
 *   read-only plan-derived lists from the existing generation workflow.
 *
 * POST /api/journal/food/grocery-lists — create a new named persistent
 *   list. Body: { title: string }.
 *
 * Auth: self-only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  createNamedGroceryList,
  getGroceryListsOverview,
  GroceryListValidationError,
} from '@/lib/plans/groceryListService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const overview = await getGroceryListsOverview(personId);
      return res.status(200).json(overview);
    }

    const body = (req.body ?? {}) as { title?: unknown };
    const list = await createNamedGroceryList(personId, String(body.title ?? ''));
    return res.status(201).json({ list });
  } catch (err) {
    if (err instanceof GroceryListValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
