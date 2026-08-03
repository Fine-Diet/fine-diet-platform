/**
 * GET    /api/journal/plans/:planId  — plan + days + slots + meals
 * PATCH  /api/journal/plans/:planId  — update title/end_date OR lifecycle action
 * DELETE /api/journal/plans/:planId  — forbidden (archive instead)
 *
 * Lifecycle contract (Package 4):
 *   - Direct `status` mutation is rejected.
 *   - `action: "archive"` → archivePlanForPerson (safe archive).
 *   - `action: "activate"` → activatePlanForPerson → activateGeneratedPlan.
 *   - Metadata patch may update title / end_date only (no action present).
 *   - Lifecycle action cannot be mixed with title/end_date.
 *   - Public hard delete is forbidden; retirement is archive-based.
 *
 * Auth: three-step pattern. GET supports view-as-client.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  activatePlanForPerson,
  archivePlanForPerson,
  getPlan,
  getPlanDetail,
  updatePlan,
} from '@/lib/plans/planServerService';
import { validatePlanDateRange } from '@/lib/plans/planDateRangeContract';
import { httpStatusForPlanError } from '@/lib/plans/planRequestErrors';

function hasMetadataFields(body: {
  title?: unknown;
  end_date?: unknown;
}): boolean {
  return body.title !== undefined || body.end_date !== undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planId = req.query.planId;
  if (typeof planId !== 'string' || !planId) {
    return res.status(400).json({ error: 'planId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return;
      const detail = await getPlanDetail(targetPersonId, planId);
      if (!detail) return res.status(404).json({ error: 'Plan not found' });
      return res.status(200).json(detail);
    }

    if (req.method === 'PATCH') {
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;
      const body = (req.body ?? {}) as {
        title?: string | null;
        status?: unknown;
        end_date?: string | null;
        action?: unknown;
      };

      if (body.status !== undefined) {
        return res.status(400).json({
          error:
            'Direct status mutation is not allowed. Use action: "archive" or action: "activate".',
          code: 'PLAN_STATUS_MUTATION_FORBIDDEN',
        });
      }

      const actionPresent = Object.prototype.hasOwnProperty.call(body, 'action');
      if (actionPresent) {
        if (typeof body.action !== 'string') {
          return res.status(400).json({
            error: 'action must be a string: "archive" or "activate".',
            code: 'PLAN_ACTION_INVALID',
          });
        }
        const action = body.action.trim().toLowerCase();
        if (!action) {
          return res.status(400).json({
            error: 'action must be "archive" or "activate".',
            code: 'PLAN_ACTION_INVALID',
          });
        }
        if (hasMetadataFields(body)) {
          return res.status(400).json({
            error:
              'Lifecycle action cannot be combined with title or end_date. Send action alone, or metadata alone.',
            code: 'PLAN_ACTION_METADATA_MIXED',
          });
        }
        if (action === 'archive') {
          const result = await archivePlanForPerson(personId, planId);
          return res.status(200).json({
            plan: result.plan,
            was_current: result.was_current,
          });
        }
        if (action === 'activate') {
          const plan = await activatePlanForPerson(personId, planId);
          return res.status(200).json({ plan });
        }
        return res.status(400).json({
          error: 'action must be "archive" or "activate".',
          code: 'PLAN_ACTION_INVALID',
        });
      }

      // Metadata-only patch (title / end_date) — action key absent.
      const existing = await getPlan(personId, planId);
      if (!existing) return res.status(404).json({ error: 'Plan not found' });

      const patch: { title?: string | null; end_date?: string | null } = {};
      if (body.title !== undefined) {
        if (body.title !== null && typeof body.title !== 'string') {
          return res.status(400).json({ error: 'title must be a string or null.' });
        }
        patch.title = body.title;
      }
      if (body.end_date !== undefined) {
        const range = validatePlanDateRange({
          start_date: existing.start_date,
          end_date: body.end_date,
          plan_shape: existing.plan_shape,
        });
        if (!range.ok) {
          return res.status(400).json({ error: range.error });
        }
        patch.end_date = range.end_date;
      }

      if (patch.title === undefined && patch.end_date === undefined) {
        return res.status(400).json({
          error:
            'No editable fields provided. Supply title/end_date, or action archive/activate.',
        });
      }

      const plan = await updatePlan(personId, planId, patch);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      return res.status(200).json({ plan });
    }

    if (req.method === 'DELETE') {
      // Auth still required so anonymous callers do not probe the surface, but
      // never call deletePlan and never disclose whether the plan exists.
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      res.setHeader('Allow', ['GET', 'PATCH']);
      return res.status(405).json({
        error:
          'Hard plan deletion is not allowed. Retire plans with PATCH { "action": "archive" }.',
        code: 'PLAN_DELETE_FORBIDDEN',
      });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    const status = httpStatusForPlanError(err);
    if (status) {
      return res.status(status).json({
        error: err instanceof Error ? err.message : 'Plan request failed.',
      });
    }
    console.error('[API /journal/plans/:planId] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
