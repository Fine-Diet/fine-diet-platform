/**
 * Admin API: Program Guidance — Get & Update (Plans Phase 7)
 *
 * GET   /api/admin/program-guidance/:id   Fetch a single guidance row.
 * PATCH /api/admin/program-guidance/:id   Update fields. Payload is
 *   validated against ProgramGuidanceAdminUpdateSchema; the nested
 *   guidance_payload_json (when present) is strictly validated.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramGuidanceAdminUpdateSchema } from '@/lib/plans/validators';
import {
  getGuidanceById,
  updateGuidance,
} from '@/lib/plans/programGuidanceAdminServerService';
import type { ProgramPlanGuidance } from '@/lib/plans/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramPlanGuidance | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) {
    return res.status(400).json({ error: 'Missing id path parameter.' });
  }

  if (req.method === 'GET') {
    try {
      const row = await getGuidanceById(id);
      if (!row) return res.status(404).json({ error: 'Not found.' });
      return res.status(200).json(row);
    } catch (err) {
      console.error('[admin/program-guidance GET id] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramGuidanceAdminUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program guidance patch.',
        issues: parsed.error.flatten(),
      });
    }

    try {
      const existing = await getGuidanceById(id);
      if (!existing) return res.status(404).json({ error: 'Not found.' });

      const updated = await updateGuidance(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      console.error('[admin/program-guidance PATCH id] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
