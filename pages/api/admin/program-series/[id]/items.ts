/**
 * Admin API: Program Series Items — list & add (Packet 23)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  addProgramSeriesItem,
  getProgramSeriesById,
  listProgramSeriesItems,
  ProgramSeriesItemCreateSchema,
  type ProgramSeriesItemRow,
} from '@/lib/programs/programSeriesAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ProgramSeriesItemRow[] | ProgramSeriesItemRow | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'series id is required' });
  }

  if (req.method === 'GET') {
    try {
      const rows = await listProgramSeriesItems(id);
      return res.status(200).json(rows);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramSeriesItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program series item payload.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const series = await getProgramSeriesById(id);
      if (!series) return res.status(404).json({ error: 'Series not found' });
      const created = await addProgramSeriesItem(id, parsed.data);
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
