/**
 * POST /api/journal/food/grocery-lists/:listId/items
 *
 * Add a manual item to a persistent (planless) grocery list. Plan-derived
 * lists reject this — their items come exclusively from plan generation.
 *
 * Body: { name: string, quantity?: number, unit?: string, notes?: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  addGroceryListItem,
  GroceryListNotFoundError,
  GroceryListValidationError,
} from '@/lib/plans/groceryListService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const listId = req.query.listId;
  if (typeof listId !== 'string' || !listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as {
      name?: unknown;
      quantity?: unknown;
      unit?: unknown;
      notes?: unknown;
    };
    const item = await addGroceryListItem(personId, listId, body);
    return res.status(201).json({ item });
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryListValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId/items] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
