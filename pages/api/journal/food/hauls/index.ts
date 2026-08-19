/**
 * GET /api/journal/food/hauls
 *
 * Packet 11E — person-scoped Haul collection read path.
 *
 * Returns lightweight presentation items for the Groceries landing Hauls
 * section and the /app/food/hauls collection page.
 *
 * Read-only. Never mutates Haul, List, Pantry, pricing, or retailer state.
 * Auth: self-only via requireJournalAccess.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { listGroceryHaulsForPerson } from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    const hauls = await listGroceryHaulsForPerson(personId);
    return res.status(200).json({ hauls });
  } catch (err) {
    console.error('[API /journal/food/hauls] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
