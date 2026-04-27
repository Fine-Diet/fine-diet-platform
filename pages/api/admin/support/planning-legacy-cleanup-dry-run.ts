/**
 * GET /api/admin/support/planning-legacy-cleanup-dry-run
 *
 * Packet 62 — admin-only, read-only legacy metadata cleanup-readiness dry-run.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getPlanningLegacyCleanupDryRun,
  type LegacyCleanupClassification,
  type LegacyPlanningMetadataKey,
  type PlanningLegacyCleanupDryRun,
} from '@/lib/admin/planningLegacyCleanupReadinessService';

type ResponseBody = PlanningLegacyCleanupDryRun | { error: string };

function parseMetadataKey(value: unknown): LegacyPlanningMetadataKey | 'all' {
  if (
    value === 'plan_day_templates' ||
    value === 'plan_week_patterns' ||
    value === 'pantry_on_hand_items' ||
    value === 'grocery_ingredient_resolutions'
  ) {
    return value;
  }
  return 'all';
}

function parseClassification(value: unknown): LegacyCleanupClassification | 'all' {
  if (
    value === 'cleanup_candidate' ||
    value === 'review_required' ||
    value === 'malformed_legacy' ||
    value === 'unmatched_legacy' ||
    value === 'table_conflict'
  ) {
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
    const dryRun = await getPlanningLegacyCleanupDryRun({
      person_id: typeof req.query.person_id === 'string' ? req.query.person_id : null,
      metadata_key: parseMetadataKey(req.query.metadata_key),
      classification: parseClassification(req.query.classification),
      limit: parseLimit(req.query.limit),
    });
    return res.status(200).json(dryRun);
  } catch (err) {
    console.error('[admin/support/planning-legacy-cleanup-dry-run] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
