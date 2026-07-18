/**
 * POST /api/journal/plans/templates/week-patterns/:patternId/instantiate
 *
 * Packet 43 — apply a saved week/multi-day pattern into a contiguous target
 * span. Always append-only; populated target spans require explicit
 * allow_duplicate_append confirmation.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { instantiatePlanWeekPattern } from '@/lib/plans/planServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const patternId = req.query.patternId;
  if (typeof patternId !== 'string' || !patternId) {
    return res.status(400).json({ error: 'patternId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as {
      plan_id?: unknown;
      target_start_plan_day_id?: unknown;
      apply_policy?: unknown;
      allow_duplicate_append?: unknown;
      application_mode?: unknown;
      repeat_weeks?: unknown;
      until_date_local?: unknown;
    };
    const planId = typeof body.plan_id === 'string' ? body.plan_id : null;
    const targetStartPlanDayId =
      typeof body.target_start_plan_day_id === 'string'
        ? body.target_start_plan_day_id
        : null;
    const applyPolicy = body.apply_policy === 'append' ? body.apply_policy : undefined;
    const allowDuplicateAppend = body.allow_duplicate_append === true;
    const applicationMode =
      body.application_mode === 'once' ||
      body.application_mode === 'repeat_weeks' ||
      body.application_mode === 'until_date'
        ? body.application_mode
        : undefined;
    const repeatWeeks =
      typeof body.repeat_weeks === 'number' && Number.isInteger(body.repeat_weeks)
        ? body.repeat_weeks
        : undefined;
    const untilDateLocal =
      typeof body.until_date_local === 'string' ? body.until_date_local : undefined;

    if (!planId || !targetStartPlanDayId) {
      return res.status(400).json({
        error: 'plan_id and target_start_plan_day_id are required.',
      });
    }

    const result = await instantiatePlanWeekPattern({
      personId,
      patternId,
      targetPlanId: planId,
      targetStartPlanDayId,
      applyPolicy,
      allowDuplicateAppend,
      application_mode: applicationMode,
      repeat_weeks: repeatWeeks,
      until_date_local: untilDateLocal,
    });
    return res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    if (message.toLowerCase().includes('confirm append')) {
      return res.status(409).json({ error: message });
    }
    console.error('[API /journal/plans/templates/week-patterns/:patternId/instantiate] error:', err);
    return res.status(500).json({ error: message });
  }
}
