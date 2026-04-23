/**
 * PATCH /api/journal/plans/grocery-items/:itemId
 *
 * Packet 37 — Update the status of a single grocery item.
 * Powers the check/off interaction on the shopping list.
 *
 * Body:
 *   { status: 'pending' | 'have' | 'bought' | 'skipped' }
 *
 * Response:
 *   { item: GroceryItem }
 *
 * Auth: self-only writes (enforced via person_id equality in the update).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { updateGroceryItemStatus } from '@/lib/plans/groceryServerService';
import type { GroceryItemStatus } from '@/lib/plans/types';

const ALLOWED_STATUSES: readonly GroceryItemStatus[] = [
  'pending',
  'have',
  'bought',
  'skipped',
] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const itemId = req.query.itemId;
  if (typeof itemId !== 'string' || !itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as { status?: unknown };
    const status =
      typeof body.status === 'string' &&
      (ALLOWED_STATUSES as readonly string[]).includes(body.status)
        ? (body.status as GroceryItemStatus)
        : null;

    if (!status) {
      return res.status(400).json({
        error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
      });
    }

    const item = await updateGroceryItemStatus(personId, itemId, status);
    return res.status(200).json({ item });
  } catch (err) {
    console.error('[API /journal/plans/grocery-items/:itemId PATCH] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
