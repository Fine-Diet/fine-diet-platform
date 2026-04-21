/**
 * Admin API: reorder modules within a program (Plans Phase 12)
 *
 * POST /api/admin/programs/[id]/modules-reorder
 *   body: { ordered_ids: string[] }
 *
 * Ids that don't belong to the program are silently ignored.
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ReorderSchema } from '@/lib/programs/contentValidators';
import { reorderModules } from '@/lib/programs/programContentAdminServerService';
import type { ProgramModule } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramModule[] | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'program id is required' });
  }

  const parsed = ReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid reorder payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const modules = await reorderModules(id, parsed.data.ordered_ids);
    return res.status(200).json(modules);
  } catch (err) {
    console.error('[admin/programs/:id/modules-reorder] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
