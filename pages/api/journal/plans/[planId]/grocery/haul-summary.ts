/**
 * GET /api/journal/plans/:planId/grocery/haul-summary?grocery_list_id=...
 *
 * Stage 1 — Deterministic haul estimate summary for a grocery list.
 *
 * Response:
 *   { summary: GroceryHaulSummary, observations_by_match_key: Record<string, GroceryPriceObservation> }
 *
 * Auth: self-only read via requireJournalAuth + resolveJournalTargetPerson.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { getPlan } from '@/lib/plans/planServerService';
import { getGroceryHaulSummaryForList } from '@/lib/plans/groceryPriceServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const planId = req.query.planId;
  if (typeof planId !== 'string' || !planId) {
    return res.status(400).json({ error: 'planId is required' });
  }

  const groceryListId = typeof req.query.grocery_list_id === 'string'
    ? req.query.grocery_list_id
    : null;
  if (!groceryListId) {
    return res.status(400).json({ error: 'grocery_list_id is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
    if (!targetPersonId) return;

    const plan = await getPlan(targetPersonId, planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const bundle = await getGroceryHaulSummaryForList({
      personId: targetPersonId,
      groceryListId,
    });
    return res.status(200).json(bundle);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('[API /journal/plans/:planId/grocery/haul-summary] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
