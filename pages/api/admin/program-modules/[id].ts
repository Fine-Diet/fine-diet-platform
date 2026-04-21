/**
 * Admin API: program module — get / update / delete (Plans Phase 12)
 *
 * GET    /api/admin/program-modules/[id]
 * PATCH  /api/admin/program-modules/[id]
 * DELETE /api/admin/program-modules/[id]
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramModuleUpdateSchema } from '@/lib/programs/contentValidators';
import {
  deleteModule,
  getModuleById,
  updateModule,
} from '@/lib/programs/programContentAdminServerService';
import type { ProgramModule } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ProgramModule | { ok: true } | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }

  if (req.method === 'GET') {
    try {
      const module = await getModuleById(id);
      if (!module) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(module);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramModuleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid module patch.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const updated = await updateModule(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await deleteModule(id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
