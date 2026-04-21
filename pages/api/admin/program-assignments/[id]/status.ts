/**
 * Admin API: Program Assignments — Set Status (Plans Phase 8)
 *
 * POST /api/admin/program-assignments/:id/status
 *   Body: { status: ProgramAssignmentStatus }
 *
 * Shortcut for updating lifecycle state; the same result is achievable
 * via PATCH /[id]. Kept as a distinct endpoint so admin UIs can render
 * explicit "Activate / Complete / Cancel" buttons.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramAssignmentStatusPatchSchema } from '@/lib/plans/validators';
import {
  getAssignmentById,
  setAssignmentStatus,
} from '@/lib/plans/programAssignmentServerService';
import type { ProgramAssignment } from '@/lib/plans/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramAssignment | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing id path parameter.' });

  const parsed = ProgramAssignmentStatusPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid status patch.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const existing = await getAssignmentById(id);
    if (!existing) return res.status(404).json({ error: 'Not found.' });
    const updated = await setAssignmentStatus(id, parsed.data.status);
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[admin/program-assignments status] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
