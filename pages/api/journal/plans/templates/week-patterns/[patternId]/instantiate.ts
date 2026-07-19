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
import { isRealCalendarDateKey } from '@/lib/plans/planDateRange';
import { httpStatusForPlanError } from '@/lib/plans/planRequestErrors';
import { WEEK_PATTERN_APPLICATION_MODES } from '@/lib/plans/reusableWeekPatternApply';

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

    if (!planId || !targetStartPlanDayId) {
      return res.status(400).json({
        error: 'plan_id and target_start_plan_day_id are required.',
      });
    }

    // Request-shape validation: an invalid application_mode, repeat_weeks,
    // or until_date_local must surface as an explicit 400 — never silently
    // fall back to a default and never bubble up as a 500.
    if (
      body.application_mode !== undefined &&
      !WEEK_PATTERN_APPLICATION_MODES.includes(
        body.application_mode as (typeof WEEK_PATTERN_APPLICATION_MODES)[number],
      )
    ) {
      return res.status(400).json({
        error: `application_mode must be one of: ${WEEK_PATTERN_APPLICATION_MODES.join(', ')}.`,
      });
    }
    const applicationMode = body.application_mode as
      | (typeof WEEK_PATTERN_APPLICATION_MODES)[number]
      | undefined;

    if (
      body.repeat_weeks !== undefined &&
      (typeof body.repeat_weeks !== 'number' ||
        !Number.isInteger(body.repeat_weeks) ||
        body.repeat_weeks < 1)
    ) {
      return res.status(400).json({ error: 'repeat_weeks must be a positive integer.' });
    }
    const repeatWeeks = typeof body.repeat_weeks === 'number' ? body.repeat_weeks : undefined;

    if (
      body.until_date_local !== undefined &&
      (typeof body.until_date_local !== 'string' || !isRealCalendarDateKey(body.until_date_local))
    ) {
      return res.status(400).json({
        error: 'until_date_local must be a valid YYYY-MM-DD calendar date.',
      });
    }
    const untilDateLocal =
      typeof body.until_date_local === 'string' ? body.until_date_local : undefined;

    if (applicationMode === 'until_date' && !untilDateLocal) {
      return res.status(400).json({
        error: 'until_date_local is required when application_mode is until_date.',
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
    const status = httpStatusForPlanError(err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (status) {
      return res.status(status).json({ error: message });
    }
    // Fallback for any not-yet-migrated error paths that still throw plain
    // Errors with a recognizable message.
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
