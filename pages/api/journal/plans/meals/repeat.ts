/**
 * POST /api/journal/plans/meals/repeat
 *
 * Repeats one already-canonical planned meal onto explicitly selected open
 * occasions inside the active plan. Revalidates each destination server-side.
 * Existing destination planned truth always wins.
 *
 * Auth: self-only writes. Body never includes a person identifier.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { httpStatusForPlanError } from '@/lib/plans/planRequestErrors';
import {
  PlanRepeatCommandError,
  parseRepeatSelectedOpenCommand,
} from '@/lib/plans/planRepeat/policy';
import { repeatSelectedOpenForPerson } from '@/lib/plans/planRepeatServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const command = parseRepeatSelectedOpenCommand(req.body ?? {});
    if (!command) {
      return res.status(400).json({
        error: 'planId, sourcePlannedMealId, and selected destinations are required.',
        reasonCode: 'invalid_request',
      });
    }

    const result = await repeatSelectedOpenForPerson({
      personId: ctx.personId,
      command,
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof PlanRepeatCommandError) {
      return res.status(err.status).json({
        error: err.message,
        reasonCode: err.reasonCode,
      });
    }
    const status = httpStatusForPlanError(err);
    if (status) {
      return res.status(status).json({
        error: err instanceof Error ? err.message : 'Request failed.',
        reasonCode: status === 404 ? 'plan_not_found' : 'invalid_request',
      });
    }
    console.error('[API /journal/plans/meals/repeat] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      reasonCode: 'repeat_write_failed',
    });
  }
}
