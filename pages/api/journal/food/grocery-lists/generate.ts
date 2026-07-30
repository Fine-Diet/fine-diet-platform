/**
 * POST /api/journal/food/grocery-lists/generate
 *
 * Persistent Grocery Lists v1 — mandatory target-list generation. Reconciles
 * a Plan's planned-meal demand for a date range additively into a chosen
 * persistent Grocery List (defaults to "My Grocery List"), without deleting
 * manual items or other batches. See
 * lib/plans/groceryListService.ts#reconcilePlanScopeIntoGroceryList for the
 * reconciliation contract.
 *
 * Body:
 *   {
 *     target_list_id?: string,  // defaults to the caller's default list
 *     plan_id: string,
 *     date: string,             // YYYY-MM-DD
 *     date_end?: string,        // defaults to date
 *     regenerate?: boolean,     // forwarded to the underlying plan-scoped generation
 *   }
 *
 * Auth: self-only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { getPlan } from '@/lib/plans/planServerService';
import {
  GroceryListNotFoundError,
  GroceryListValidationError,
  reconcilePlanScopeIntoGroceryList,
} from '@/lib/plans/groceryListService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as {
      target_list_id?: unknown;
      plan_id?: unknown;
      date?: unknown;
      date_end?: unknown;
      regenerate?: unknown;
    };

    const planId = typeof body.plan_id === 'string' && body.plan_id ? body.plan_id : null;
    if (!planId) return res.status(400).json({ error: 'plan_id is required.' });

    const dateStart = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : null;
    if (!dateStart) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required.' });

    const dateEnd = typeof body.date_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date_end)
      ? body.date_end
      : dateStart;
    if (dateEnd < dateStart) {
      return res.status(400).json({ error: 'date_end must be on or after date.' });
    }

    const plan = await getPlan(personId, planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const targetListId = typeof body.target_list_id === 'string' && body.target_list_id
      ? body.target_list_id
      : undefined;

    const result = await reconcilePlanScopeIntoGroceryList({
      personId,
      targetListId,
      planId,
      dateStart,
      dateEnd,
      forceRegenerate: body.regenerate === true,
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryListValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/generate] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
