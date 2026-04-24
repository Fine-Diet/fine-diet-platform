/**
 * POST /api/journal/plans/meals/:mealId/execute
 *
 * Packet 39 — Plan-to-Journal execution endpoint.
 *
 * Lets the user act on a planned meal without mutating its planned truth.
 * The planned_meal payload is preserved; a real journal_entry is created
 * for "eat" so the consumption is reflected in the user's daily journal.
 *
 * Body:
 *   {
 *     action:      "eat" | "skip" | "undo"
 *     occurred_at?: string  // ISO — when the meal was eaten (eat only)
 *                           // Defaults to server-current time if absent
 *   }
 *
 * Response 200:
 *   {
 *     meal:           PlannedMeal   // updated with execution_state + journal_entry_id
 *     journal_entry?: JournalEntry  // present only for action="eat"
 *   }
 *
 * Action semantics:
 *   eat  — creates a journal_entry (intake) from the meal's totals, stores
 *          back-link on the planned_meal, sets execution_state='eaten'.
 *   skip — marks execution_state='skipped'; no journal entry.
 *   undo — reverts execution_state to 'pending'; deletes the linked journal
 *          entry (if one exists) so consumption records stay accurate.
 *
 * Auth: self-only writes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  executePlannedMeal,
  type ExecuteAction,
} from '@/lib/plans/planServerService';

const VALID_ACTIONS: ExecuteAction[] = ['eat', 'skip', 'undo'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const mealId = req.query.mealId;
  if (typeof mealId !== 'string' || !mealId) {
    return res.status(400).json({ error: 'mealId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = body.action;
    if (!action || !VALID_ACTIONS.includes(action as ExecuteAction)) {
      return res.status(400).json({
        error: `action must be one of: ${VALID_ACTIONS.join(', ')}`,
      });
    }

    const occurred_at =
      typeof body.occurred_at === 'string' ? body.occurred_at : undefined;

    const result = await executePlannedMeal(
      personId,
      mealId,
      action as ExecuteAction,
      occurred_at,
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error('[POST /api/journal/plans/meals/:mealId/execute]', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    if (msg === 'Planned meal not found.') {
      return res.status(404).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
}
