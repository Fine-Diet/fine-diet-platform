/**
 * Admin API: Programs — Full authoring tree (Plans Phase 12)
 *
 * GET /api/admin/programs/[id]/tree
 *   Returns the program plus all modules and items regardless of status,
 *   so the admin editor sees drafts and archives together.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { getAdminProgramTreeById } from '@/lib/programs/programContentAdminServerService';
import type { ProgramWithTree } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramWithTree | { error: string }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    const tree = await getAdminProgramTreeById(id);
    if (!tree) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(tree);
  } catch (err) {
    console.error('[admin/programs/:id/tree] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
