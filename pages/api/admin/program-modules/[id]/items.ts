/**
 * Admin API: program module content items — list & create (Plans Phase 12)
 *
 * GET  /api/admin/program-modules/[id]/items
 * POST /api/admin/program-modules/[id]/items
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramContentItemCreateSchema } from '@/lib/programs/contentValidators';
import {
  createItem,
  getModuleById,
  listItemsForModule,
} from '@/lib/programs/programContentAdminServerService';
import type { ProgramContentItem } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | ProgramContentItem
    | ProgramContentItem[]
    | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'module id is required' });
  }

  if (req.method === 'GET') {
    try {
      const items = await listItemsForModule(id);
      return res.status(200).json(items);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramContentItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid content item payload.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const module = await getModuleById(id);
      if (!module) return res.status(404).json({ error: 'Module not found' });
      const created = await createItem(id, parsed.data);
      return res.status(201).json(created);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
