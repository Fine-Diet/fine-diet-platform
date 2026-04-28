/**
 * GET /api/admin/support/planning-storage-audit
 *
 * Packet 61 — admin-only, read-only storage-source/backfill audit over the
 * migrated planning/grocery tables.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getPlanningStorageAudit,
  type PlanningStorageAudit,
  type StorageSourceBucket,
} from '@/lib/admin/planningStorageAuditService';

type ResponseBody = PlanningStorageAudit | { error: string };

function parseStorageSource(value: unknown): StorageSourceBucket | 'all' {
  if (value === 'table_direct' || value === 'legacy_metadata' || value === 'unknown') {
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
    const audit = await getPlanningStorageAudit({
      person_id: typeof req.query.person_id === 'string' ? req.query.person_id : null,
      storage_source: parseStorageSource(req.query.storage_source),
      limit: parseLimit(req.query.limit),
    });
    return res.status(200).json(audit);
  } catch (err) {
    console.error('[admin/support/planning-storage-audit] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
