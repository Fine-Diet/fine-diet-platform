/**
 * Food → Groceries index — read-only listing of a person's grocery lists.
 *
 * Plan-derived lists only today. The persistent default/named list model
 * (is_default, owner_id, grocery_list_contributors) is drafted in
 * scripts/sql/addGroceryListFoundation.sql but deliberately not applied yet;
 * once it is, this endpoint is the natural place to also surface the
 * default "My Grocery List" and named lists.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { listGroceryListsForPerson } from '@/lib/plans/groceryServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    const lists = await listGroceryListsForPerson(personId);
    return res.status(200).json({ lists });
  } catch (err) {
    console.error('[API /journal/food/grocery-lists] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
