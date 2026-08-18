/**
 * GET /api/journal/plans/pantry/quick-start
 *
 * Read-only Pantry Quick Start proposal. Resolves product-default staple
 * lookup queries against food_objects and excludes the caller's saved pantry
 * foods. Does not write pantry rows or generate grocery lists.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { listPantryOnHandItems } from '@/lib/plans/groceryServerService';
import { proposePantryQuickStart } from '@/lib/plans/pantryQuickStart/proposalPolicy';
import { resolvePantryQuickStartFoods } from '@/lib/plans/pantryQuickStart/resolveFoods';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;

    const [savedItems, resolvedFoods] = await Promise.all([
      listPantryOnHandItems(ctx.personId),
      resolvePantryQuickStartFoods(),
    ]);
    const proposal = proposePantryQuickStart({ savedItems, resolvedFoods });
    return res.status(200).json({ proposal });
  } catch (err) {
    console.error('[API /journal/plans/pantry/quick-start] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
