/**
 * Pantry v1 — explicit user-entered on-hand state.
 *
 * This endpoint manages pantry_on_hand_items directly. Grocery required amount
 * and still-to-buy remain derived by the existing grocery read model.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { listPantryOnHandItems } from '@/lib/plans/groceryServerService';
import {
  deletePantryOnHandItem,
  updatePantryOnHandItem,
} from '@/lib/plans/groceryStateStore';

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function statusForError(err: unknown): number {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('not found')) return 404;
  if (message.includes('already exists')) return 409;
  if (message.includes('non-negative')) return 400;
  return 500;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const pantry_items = await listPantryOnHandItems(personId);
      return res.status(200).json({ pantry_items });
    }

    const key = firstParam(req.query.key);
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }

    if (req.method === 'DELETE') {
      await deletePantryOnHandItem(personId, key);
      return res.status(200).json({ ok: true });
    }

    const body = (req.body ?? {}) as { quantity?: unknown; unit?: unknown };
    if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative number' });
    }
    if (body.unit != null && typeof body.unit !== 'string') {
      return res.status(400).json({ error: 'unit must be a string when provided' });
    }

    const pantry_item = await updatePantryOnHandItem(personId, key, {
      quantity: body.quantity,
      unit: body.unit ?? null,
    });
    return res.status(200).json({ pantry_item });
  } catch (err) {
    console.error('[API /journal/plans/pantry] error:', err);
    return res.status(statusForError(err)).json({
      error: err instanceof Error && statusForError(err) < 500
        ? err.message
        : 'Internal server error',
    });
  }
}
