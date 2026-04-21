/**
 * Admin API: Program Assignments Backfill (Plans Phase 9)
 *
 * POST /api/admin/program-assignments/backfill
 *   Body: { dry_run?: boolean, limit?: number }
 *
 * Sweeps active person_entitlements rows and idempotently ensures a
 * matching program_assignments row exists for every mappable one.
 *
 * `dry_run=true` reports the plan without persisting anything. Intended
 * for historical backfills of purchases/grants that predate Packet 9
 * automation; safe to re-run (idempotent).
 *
 * Protected: admin role only — this is a bulk write path.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  backfillAssignmentsFromEntitlements,
  type BackfillReport,
} from '@/lib/plans/programAssignmentAutomationServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BackfillReport | { error: string }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body ?? {};
  const dryRun = body.dry_run === true;
  const rawLimit = Number(body.limit);
  const limit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : undefined;

  try {
    const report = await backfillAssignmentsFromEntitlements({
      dryRun,
      limit,
    });
    return res.status(200).json(report);
  } catch (err) {
    console.error('[program-assignments/backfill] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
