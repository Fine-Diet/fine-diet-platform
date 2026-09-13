/**
 * GET  /api/journal/plans           — list current person's plans
 * POST /api/journal/plans           — manual plan stub (empty plan, no meals)
 *
 * Auth: three-step pattern.
 *   - requireJournalAuth
 *   - resolveJournalTargetPerson (GET, supports view-as-client)
 *   - requireCallerJournalAccess (POST, self-only)
 *
 * AI-driven plan generation is handled by /ai/generate, not this route.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  createManualPlanForPerson,
  listPlansForPerson,
} from '@/lib/plans/planServerService';
import { validatePlanDateRange } from '@/lib/plans/planDateRangeContract';
import type { PlanShape } from '@/lib/plans/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return;
      const plans = await listPlansForPerson(targetPersonId);
      return res.status(200).json({ plans });
    }

    if (req.method === 'POST') {
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;
      const body = (req.body ?? {}) as {
        title?: string | null;
        plan_shape?: PlanShape;
        start_date?: string;
        end_date?: string | null;
      };

      const plan_shape: PlanShape = body.plan_shape ?? 'week';
      if (!['day', 'week', 'multi_day'].includes(plan_shape)) {
        return res.status(400).json({ error: 'plan_shape must be day, week, or multi_day.' });
      }
      const range = validatePlanDateRange({
        start_date: body.start_date,
        end_date: body.end_date ?? null,
        plan_shape,
      });
      if (!range.ok) {
        return res.status(400).json({ error: range.error });
      }
      const plan = await createManualPlanForPerson({
        personId,
        title: body.title ?? null,
        planShape: plan_shape,
        startDate: range.start_date,
        endDate: range.end_date,
      });

      return res.status(201).json({ plan });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
