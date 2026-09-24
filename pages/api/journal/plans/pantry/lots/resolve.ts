/**
 * POST /api/journal/plans/pantry/lots/resolve
 *
 * Owner-scoped resolution for open pantry acquisition lots.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  resolvePantryAcquisitionLot,
  type PantryAcquisitionLotResolutionOutcome,
} from '@/lib/plans/pantryAcquisitionLotService';

function errorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('not found')) return 404;
  if (
    message.includes('already resolved')
    || message.includes('cannot be edited')
    || message.includes('lifecycle cannot')
  ) return 409;
  if (
    message.includes('No remaining')
    || message.includes('Invalid')
  ) return 400;
  return 500;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const lotId = typeof body.lot_id === 'string' ? body.lot_id : '';
  const outcome = body.outcome;
  if (!lotId) return res.status(400).json({ error: 'lot_id is required' });
  if (outcome !== 'completed' && outcome !== 'disposed') {
    return res.status(400).json({ error: 'outcome must be completed or disposed' });
  }

  try {
    const lot = await resolvePantryAcquisitionLot({
      personId: ctx.personId,
      lotId,
      outcome: outcome as PantryAcquisitionLotResolutionOutcome,
    });
    return res.status(200).json({ lot });
  } catch (err) {
    return res.status(errorStatus(err)).json({
      error: err instanceof Error ? err.message : 'Unable to resolve purchase.',
    });
  }
}
