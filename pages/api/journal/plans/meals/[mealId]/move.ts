/**
 * POST /api/journal/plans/meals/:mealId/move
 *
 * Packet 40 — move/reschedule one pending planned meal to another day/slot.
 * Identity and provenance stay on the same planned_meal row; only scheduling
 * columns change. Already handled meals must be undone first.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { movePlannedMeal } from '@/lib/plans/planServerService';

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

    const body = (req.body ?? {}) as {
      target_plan_day_id?: unknown;
      target_plan_slot_id?: unknown;
    };
    const targetPlanDayId =
      typeof body.target_plan_day_id === 'string' ? body.target_plan_day_id : null;
    const targetPlanSlotId =
      typeof body.target_plan_slot_id === 'string'
        ? body.target_plan_slot_id
        : body.target_plan_slot_id === null
          ? null
          : undefined;

    if (!targetPlanDayId) {
      return res.status(400).json({ error: 'target_plan_day_id is required.' });
    }
    if (targetPlanSlotId === undefined) {
      return res
        .status(400)
        .json({ error: 'target_plan_slot_id must be a string or null.' });
    }

    const result = await movePlannedMeal(
      personId,
      mealId,
      targetPlanDayId,
      targetPlanSlotId,
    );
    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('handled') || message.includes('Handled')) {
      return res.status(409).json({ error: message });
    }
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    console.error('[API /journal/plans/meals/:mealId/move] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
