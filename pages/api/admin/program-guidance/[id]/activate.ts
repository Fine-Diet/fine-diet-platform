/**
 * Admin API: Program Guidance — Activate (Plans Phase 7)
 *
 * POST /api/admin/program-guidance/:id/activate
 *   Sets `active = true`. Effective dates are left unchanged, so the row
 *   may still be date-gated out of the consumer-side window.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  activateGuidance,
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

    const updated = await activateGuidance(id);
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[admin/program-guidance activate] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
