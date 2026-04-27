/**
 * POST /api/journal/plans/:planId/grocery/generate
 *
 * Packet 37 — Generate (or return an existing) grocery/shopping list
 * from the planned meals for a given date range within a plan.
 *
 * Body:
 *   {
 *     date: string,          // YYYY-MM-DD (single day; also used as date_end)
 *     date_end?: string,     // YYYY-MM-DD (optional range end; defaults to date)
 *     regenerate?: boolean   // if true, replaces existing list + items
 *   }
 *
 * Response (201 or 200):
 *   {
 *     list:          GeneratedGroceryList,
 *     items:         GroceryItem[],
 *     list_context:  GroceryActiveListContext,
 *     source_meals:  PlannedMeal[]    // meals that contributed items (for provenance display)
 *   }
 *
 * Auth: self-only writes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { getPlan } from '@/lib/plans/planServerService';
import { generateGroceryList } from '@/lib/plans/groceryServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const planId = req.query.planId;
  if (typeof planId !== 'string' || !planId) {
    return res.status(400).json({ error: 'planId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const plan = await getPlan(personId, planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const body = (req.body ?? {}) as {
      date?: unknown;
      date_end?: unknown;
      regenerate?: unknown;
    };

    const dateStart = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : null;
    if (!dateStart) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) is required.' });
    }

    const dateEnd =
      typeof body.date_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date_end)
        ? body.date_end
        : dateStart;
    if (dateEnd < dateStart) {
      return res.status(400).json({ error: 'date_end must be on or after date.' });
    }

    const regenerate = body.regenerate === true;

    const result = await generateGroceryList({
      personId,
      planId,
      dateStart,
      dateEnd,
      forceRegenerate: regenerate,
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error('[API /journal/plans/:planId/grocery/generate POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
