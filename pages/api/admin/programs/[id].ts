/**
 * Admin API: Programs — Get / Update / Delete (Plans Phase 12)
 *
 * GET    /api/admin/programs/[id]
 * PATCH  /api/admin/programs/[id]
 * DELETE /api/admin/programs/[id]
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramUpdateSchema } from '@/lib/programs/contentValidators';
import {
  deleteProgram,
  getProgramById,
  updateProgram,
} from '@/lib/programs/programContentAdminServerService';
import type { Program } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Program | { ok: true } | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }

  if (req.method === 'GET') {
    try {
      const program = await getProgramById(id);
      if (!program) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(program);
    } catch (err) {
      console.error('[admin/programs/:id GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program patch.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const updated = await updateProgram(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      console.error('[admin/programs/:id PATCH] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await deleteProgram(id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[admin/programs/:id DELETE] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
