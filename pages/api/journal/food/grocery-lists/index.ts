/**
 * Food → Groceries index API.
 *
 * GET  — Overview for the index page: the caller's persistent default list
 *        ("My Grocery List", auto-created on first call), active named
 *        lists, and recent plan-derived lists.
 * POST — Create a new named persistent list. Body: { title: string }.
 *
 * Persistent list support requires scripts/sql/addGroceryListFoundation.sql
 * to be applied; until then these calls will fail against the live schema
 * (review-first packet — not applied).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  createNamedGroceryList,
  getGroceryListsOverview,
  GroceryListValidationError,
} from '@/lib/plans/groceryListService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const overview = await getGroceryListsOverview(personId);
      return res.status(200).json(overview);
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as { title?: unknown };
      const list = await createNamedGroceryList(personId, body.title);
      return res.status(201).json({ list });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
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
