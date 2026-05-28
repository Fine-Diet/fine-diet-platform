/**
 * Admin API: Program Series — get / update / archive (Packet 23)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  archiveProgramSeries,
  getProgramSeriesById,
  ProgramSeriesUpdateSchema,
  updateProgramSeries,
  type ProgramSeriesRow,
} from '@/lib/programs/programSeriesAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramSeriesRow | { ok: true } | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }

  if (req.method === 'GET') {
    try {
      const row = await getProgramSeriesById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(row);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramSeriesUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program series patch.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const updated = await updateProgramSeries(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await archiveProgramSeries(id);
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
