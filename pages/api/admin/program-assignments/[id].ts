/**
 * Admin API: Program Assignments — Get & Update (Plans Phase 8)
 *
 * GET   /api/admin/program-assignments/:id    Fetch a single row.
 * PATCH /api/admin/program-assignments/:id    Partial update. Validated
 *                                             by ProgramAssignmentUpdateSchema.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramAssignmentUpdateSchema } from '@/lib/plans/validators';
import {
  getAssignmentById,
  updateAssignment,
} from '@/lib/plans/programAssignmentServerService';
import type { ProgramAssignment } from '@/lib/plans/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramAssignment | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing id path parameter.' });

  if (req.method === 'GET') {
    try {
      const row = await getAssignmentById(id);
      if (!row) return res.status(404).json({ error: 'Not found.' });
      return res.status(200).json(row);
    } catch (err) {
      console.error('[admin/program-assignments GET id] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramAssignmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid assignment patch.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const existing = await getAssignmentById(id);
      if (!existing) return res.status(404).json({ error: 'Not found.' });
      const updated = await updateAssignment(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      console.error('[admin/program-assignments PATCH id] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
