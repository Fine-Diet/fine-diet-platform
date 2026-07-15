/**
 * POST /api/journal/plans/grocery-items/:itemId/price-confirm
 *
 * Stage 1 — Confirm a sourced retail price from a recent search event.
 *
 * Body:
 *   { search_event_id: string, provider_result_id: string, package_count?: number }
 *
 * Response:
 *   { observation: GroceryPriceObservation }
 *
 * Auth: self-only writes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  GroceryPriceValidationError,
  confirmSourcedGroceryPrice,
} from '@/lib/plans/groceryPriceServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const itemId = req.query.itemId;
  if (typeof itemId !== 'string' || !itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const body = (req.body ?? {}) as {
    search_event_id?: unknown;
    provider_result_id?: unknown;
    package_count?: unknown;
  };
  if (typeof body.search_event_id !== 'string' || !body.search_event_id) {
    return res.status(400).json({ error: 'search_event_id is required' });
  }
  if (typeof body.provider_result_id !== 'string' || !body.provider_result_id) {
    return res.status(400).json({ error: 'provider_result_id is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const observation = await confirmSourcedGroceryPrice({
      personId: ctx.personId,
      input: {
        grocery_item_id: itemId,
        search_event_id: body.search_event_id,
        provider_result_id: body.provider_result_id,
        package_count: typeof body.package_count === 'number' ? body.package_count : undefined,
      },
    });
    return res.status(200).json({ observation });
  } catch (error) {
    if (error instanceof GroceryPriceValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof Error && error.message.includes('manual grocery price')) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    console.error('[API /journal/plans/grocery-items/:itemId/price-confirm] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
