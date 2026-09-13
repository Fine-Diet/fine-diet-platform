import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import { resolveMealSlotQueryParam } from '@/lib/journal/mealScheduleAssignment';
import { isRealCalendarDateKey } from '@/lib/plans/planDateRange';
import { resolvePlansHomeTargetForPerson } from '@/lib/plans/plansHomeTargetServerService';
import { httpStatusForPlanError } from '@/lib/plans/planRequestErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const dateLocal = isRealCalendarDateKey(body.dateLocal) ? body.dateLocal : null;
    const slotKey = resolveMealSlotQueryParam(body.slotKey);
    if (!dateLocal || !slotKey) {
      return res.status(400).json({
        error: 'A valid dateLocal and enabled Meal Rhythm slotKey are required.',
      });
    }

    const target = await resolvePlansHomeTargetForPerson({
      personId: ctx.personId,
      dateLocal,
      slotKey,
    });
    return res.status(200).json({ target });
  } catch (error) {
    const knownStatus = httpStatusForPlanError(error);
    if (knownStatus) {
      return res.status(knownStatus).json({
        error: error instanceof Error ? error.message : 'Plan request failed.',
      });
    }
    console.error('[API /journal/plans/home/target] error:', error);
    return res.status(500).json({ error: 'Could not prepare that planning date.' });
  }
}
