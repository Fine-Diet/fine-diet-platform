/**
 * PATCH /api/journal/plans/grocery-items/:itemId
 *
 * Packet 37 — Update the status of a single grocery item.
 * Powers the check/off interaction on the shopping list.
 *
 * Body:
 *   { status: 'pending' | 'have' | 'bought' | 'skipped' }
 *   { action: 'resolve', food_object_id: string }
 *   { action: 'set_on_hand', quantity: number, unit?: string | null }
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
import {
  resolveGroceryItemIngredient,
  setGroceryItemOnHand,
  updateGroceryItemStatus,
} from '@/lib/plans/groceryServerService';
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

    const body = (req.body ?? {}) as {
      status?: unknown;
      action?: unknown;
      food_object_id?: unknown;
      quantity?: unknown;
      unit?: unknown;
    };
    if (body.action === 'resolve') {
      if (typeof body.food_object_id !== 'string' || !body.food_object_id) {
        return res.status(400).json({ error: 'food_object_id is required' });
      }
      const item = await resolveGroceryItemIngredient({
        personId,
        itemId,
        foodObjectId: body.food_object_id,
      });
      return res.status(200).json({ item });
    }

    if (body.action === 'set_on_hand') {
      if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity < 0) {
        return res.status(400).json({ error: 'quantity must be a non-negative number' });
      }
      if (body.unit != null && typeof body.unit !== 'string') {
        return res.status(400).json({ error: 'unit must be a string when provided' });
      }
      const pantry_item = await setGroceryItemOnHand({
        personId,
        itemId,
        quantity: body.quantity,
        unit: body.unit ?? null,
      });
      return res.status(200).json({ pantry_item });
    }

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
