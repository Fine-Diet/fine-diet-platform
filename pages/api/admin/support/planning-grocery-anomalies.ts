/**
 * GET /api/admin/support/planning-grocery-anomalies
 *
 * Packet 63 — admin-only, read-only anomaly detection over planning/grocery
 * support state.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getPlanningGroceryAnomalies,
  type PlanningGroceryAnomalyCategory,
  type PlanningGroceryAnomalyReport,
  type PlanningGroceryAnomalySeverity,
} from '@/lib/admin/planningGroceryAnomalyService';

type ResponseBody = PlanningGroceryAnomalyReport | { error: string };

function parseCategory(value: unknown): PlanningGroceryAnomalyCategory | 'all' {
  if (
    value === 'reusable_planning' ||
    value === 'grocery_state' ||
    value === 'active_planning' ||
    value === 'grocery_lists' ||
    value === 'storage_provenance' ||
    value === 'legacy_cleanup_readiness'
  ) {
    return value;
  }
  return 'all';
}

function parseSeverity(value: unknown): PlanningGroceryAnomalySeverity | 'all' {
  if (value === 'info' || value === 'warning' || value === 'high') {
    return value;
  }
  return 'all';
}

function parseLimit(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    const report = await getPlanningGroceryAnomalies({
      person_id: typeof req.query.person_id === 'string' ? req.query.person_id : null,
      category: parseCategory(req.query.category),
      severity: parseSeverity(req.query.severity),
      code: typeof req.query.code === 'string' ? req.query.code : null,
      limit: parseLimit(req.query.limit),
    });
    return res.status(200).json(report);
  } catch (err) {
    console.error('[admin/support/planning-grocery-anomalies] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
