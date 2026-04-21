/**
 * Admin API: Program modules — list & create (Plans Phase 12)
 *
 * GET  /api/admin/programs/[id]/modules
 * POST /api/admin/programs/[id]/modules
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramModuleCreateSchema } from '@/lib/programs/contentValidators';
import {
  createModule,
  getProgramById,
  listModulesForProgram,
} from '@/lib/programs/programContentAdminServerService';
import type { ProgramModule } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ProgramModule | ProgramModule[] | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'program id is required' });
  }

  if (req.method === 'GET') {
    try {
      const modules = await listModulesForProgram(id);
      return res.status(200).json(modules);
    } catch (err) {
      console.error('[admin/programs/:id/modules GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramModuleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid module payload.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const program = await getProgramById(id);
      if (!program) return res.status(404).json({ error: 'Program not found' });
      const created = await createModule(id, parsed.data);
      return res.status(201).json(created);
    } catch (err) {
      console.error('[admin/programs/:id/modules POST] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
