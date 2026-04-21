/**
 * Admin API: program content item — get / update / delete (Plans Phase 12)
 *
 * GET    /api/admin/program-content-items/[id]
 * PATCH  /api/admin/program-content-items/[id]
 * DELETE /api/admin/program-content-items/[id]
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramContentItemUpdateSchema } from '@/lib/programs/contentValidators';
import {
  deleteItem,
  getItemById,
  updateItem,
} from '@/lib/programs/programContentAdminServerService';
import type { ProgramContentItem } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ProgramContentItem | { ok: true } | { error: string; issues?: unknown }
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
      const item = await getItemById(id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(item);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramContentItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid content item patch.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const updated = await updateItem(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await deleteItem(id);
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
