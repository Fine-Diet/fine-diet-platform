/**
 * GET /api/admin/support/planning-grocery-support-action-audit-logs
 *
 * Packet 66 — admin-only, read-only support action audit-log inspection.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getPlanningGrocerySupportActionAuditLogs,
} from '@/lib/admin/planningGrocerySupportActionAuditLogService';
import type {
  PlanningGrocerySupportActionAuditLogReport,
  PlanningGrocerySupportActionAuditResult,
} from '@/lib/admin/planningGrocerySupportActionAuditTypes';
import type { PlanningGrocerySupportActionRisk } from '@/lib/admin/planningGrocerySupportActionPolicy';

type ResponseBody = PlanningGrocerySupportActionAuditLogReport | { error: string };

function parseLimit(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRiskLevel(value: unknown): PlanningGrocerySupportActionRisk | 'all' {
  if (
    value === 'read_only' ||
    value === 'low_mutation' ||
    value === 'moderate_mutation' ||
    value === 'high_risk' ||
    value === 'prohibited'
  ) {
    return value;
  }
  return 'all';
}

function parseResult(value: unknown): PlanningGrocerySupportActionAuditResult | 'all' {
  if (
    value === 'requested' ||
    value === 'dry_run' ||
    value === 'approved' ||
    value === 'applied' ||
    value === 'failed' ||
    value === 'rejected' ||
    value === 'cancelled'
  ) {
    return value;
  }
  return 'all';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const report = await getPlanningGrocerySupportActionAuditLogs({
      target_person_id:
        typeof req.query.target_person_id === 'string' ? req.query.target_person_id : null,
      actor_user_id:
        typeof req.query.actor_user_id === 'string' ? req.query.actor_user_id : null,
      action_name: typeof req.query.action_name === 'string' ? req.query.action_name : null,
      risk_level: parseRiskLevel(req.query.risk_level),
      result: parseResult(req.query.result),
      from: typeof req.query.from === 'string' ? req.query.from : null,
      to: typeof req.query.to === 'string' ? req.query.to : null,
      limit: parseLimit(req.query.limit),
    });
    return res.status(200).json(report);
  } catch (err) {
    console.error('[admin/support/planning-grocery-support-action-audit-logs] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
