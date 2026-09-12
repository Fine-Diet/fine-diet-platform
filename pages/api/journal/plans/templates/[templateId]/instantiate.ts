/**
 * POST /api/journal/plans/templates/:templateId/instantiate
 *
 * Packet 42 — instantiate a saved day template into a target plan day.
 * Instantiation creates fresh pending planned_meal rows; execution history
 * and journal links never carry over from the source day.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { instantiatePlanDayTemplate } from '@/lib/plans/planServerService';
import { resolvePlansHomeTargetForPerson } from '@/lib/plans/plansHomeTargetServerService';
import { ensurePlanOccasionStructureForPerson } from '@/lib/plans/planStructureServerService';
import { readPersonMetadata } from '@/lib/plans/personMetadataStore';
import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { isRealCalendarDateKey } from '@/lib/plans/planDateRange';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const templateId = req.query.templateId;
  if (typeof templateId !== 'string' || !templateId) {
    return res.status(400).json({ error: 'templateId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as {
      plan_id?: unknown;
      target_plan_day_id?: unknown;
      apply_policy?: unknown;
      allow_duplicate_append?: unknown;
      target_date_local?: unknown;
    };
    const planId = typeof body.plan_id === 'string' ? body.plan_id : null;
    const targetPlanDayId =
      typeof body.target_plan_day_id === 'string' ? body.target_plan_day_id : null;
    const applyPolicy = body.apply_policy === 'append' ? body.apply_policy : undefined;
    const allowDuplicateAppend = body.allow_duplicate_append === true;
    const targetDateLocal = isRealCalendarDateKey(body.target_date_local)
      ? body.target_date_local
      : null;

    let resolvedPlanId = planId;
    let resolvedPlanDayId = targetPlanDayId;
    if (targetDateLocal && (!resolvedPlanId || !resolvedPlanDayId)) {
      const metadata = await readPersonMetadata(personId);
      const occasions = getEnabledMealSlots(metadata.meal_schedule);
      const first = occasions[0];
      if (!first) {
        return res.status(400).json({ error: 'Set a Meal Rhythm before applying a Day Plan.' });
      }
      const target = await resolvePlansHomeTargetForPerson({
        personId,
        dateLocal: targetDateLocal,
        slotKey: first.key,
      });
      resolvedPlanId = target.planId;
      resolvedPlanDayId = target.planDayId;
      for (const occasion of occasions.slice(1)) {
        await ensurePlanOccasionStructureForPerson({
          personId,
          command: {
            planId: target.planId,
            dateLocal: targetDateLocal,
            slotKey: occasion.key,
          },
          allowWritableDatedDayPlan: true,
        });
      }
    }

    if (!resolvedPlanId || !resolvedPlanDayId) {
      return res
        .status(400)
        .json({ error: 'A target date or plan_id and target_plan_day_id are required.' });
    }

    const result = await instantiatePlanDayTemplate({
      personId,
      templateId,
      targetPlanId: resolvedPlanId,
      targetPlanDayId: resolvedPlanDayId,
      applyPolicy,
      allowDuplicateAppend,
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
    console.error('[API /journal/plans/templates/:templateId/instantiate] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
