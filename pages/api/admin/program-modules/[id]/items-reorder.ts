/**
 * Admin API: reorder content items within a module (Plans Phase 12)
 *
 * POST /api/admin/program-modules/[id]/items-reorder
 *   body: { ordered_ids: string[] }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ReorderSchema } from '@/lib/programs/contentValidators';
import { reorderItems } from '@/lib/programs/programContentAdminServerService';
import type { ProgramContentItem } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ProgramContentItem[] | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'module id is required' });
  }

  const parsed = ReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid reorder payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const items = await reorderItems(id, parsed.data.ordered_ids);
    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
