/**
 * Admin API: Program Series Items — reorder (Packet 23)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  ProgramSeriesItemsReorderSchema,
  reorderProgramSeriesItems,
  type ProgramSeriesItemRow,
} from '@/lib/programs/programSeriesAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramSeriesItemRow[] | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'series id is required' });
  }

  const parsed = ProgramSeriesItemsReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid reorder payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const rows = await reorderProgramSeriesItems(id, parsed.data.ordered_ids);
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
