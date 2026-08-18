/**
 * POST /api/journal/plans/structure/ensure
 *
 * Ensures the canonical plan_day and matching enabled Meal Rhythm plan_slot
 * for an already-valid active plan date. Structure only — never attaches a
 * planned meal, never creates/activates/extends a plan.
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
  PlanStructureCommandError,
  parseEnsurePlanOccasionStructureCommand,
} from '@/lib/plans/planStructure/policy';
import { ensurePlanOccasionStructureForPerson } from '@/lib/plans/planStructureServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const command = parseEnsurePlanOccasionStructureCommand(req.body ?? {});
    if (!command) {
      return res.status(400).json({
        error: 'planId, dateLocal, and an enabled slotKey are required.',
        reasonCode: 'invalid_request',
      });
    }

    const result = await ensurePlanOccasionStructureForPerson({
      personId: ctx.personId,
      command,
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof PlanStructureCommandError) {
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
    console.error('[API /journal/plans/structure/ensure] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      reasonCode: 'structure_write_failed',
    });
  }
}
