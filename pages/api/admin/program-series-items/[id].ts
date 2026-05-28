/**
 * Admin API: Program Series Item — update / archive (Packet 23)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  ProgramSeriesItemUpdateSchema,
  removeProgramSeriesItem,
  updateProgramSeriesItem,
  type ProgramSeriesItemRow,
} from '@/lib/programs/programSeriesAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramSeriesItemRow | { ok: true } | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramSeriesItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program series item patch.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const updated = await updateProgramSeriesItem(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await removeProgramSeriesItem(id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
