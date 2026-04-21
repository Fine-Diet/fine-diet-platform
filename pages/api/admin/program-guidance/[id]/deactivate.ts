/**
 * Admin API: Program Guidance — Deactivate (Plans Phase 7)
 *
 * POST /api/admin/program-guidance/:id/deactivate
 *   Sets `active = false`. The row is immediately ignored by the
 *   Plans consumer path's active+effective window filter.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  deactivateGuidance,
  getGuidanceById,
} from '@/lib/plans/programGuidanceAdminServerService';
import type { ProgramPlanGuidance } from '@/lib/plans/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramPlanGuidance | { error: string }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing id path parameter.' });

  try {
    const existing = await getGuidanceById(id);
    if (!existing) return res.status(404).json({ error: 'Not found.' });

    const updated = await deactivateGuidance(id);
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[admin/program-guidance deactivate] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
