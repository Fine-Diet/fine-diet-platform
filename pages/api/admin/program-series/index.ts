/**
 * Admin API: Program Series — list & create (Packet 23)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  createProgramSeries,
  listProgramSeries,
  ProgramSeriesCreateSchema,
  type ProgramSeriesRow,
  type ProgramSeriesStatus,
} from '@/lib/programs/programSeriesAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | { rows: ProgramSeriesRow[]; total: number; limit: number; offset: number }
    | ProgramSeriesRow
    | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { status, limit, offset } = req.query;
      const statusFilter =
        typeof status === 'string' &&
        (['draft', 'published', 'archived'] as ProgramSeriesStatus[]).includes(
          status as ProgramSeriesStatus,
        )
          ? (status as ProgramSeriesStatus)
          : undefined;
      const result = await listProgramSeries({
        status: statusFilter,
        limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
        offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
      });
      return res.status(200).json(result);
    } catch (err) {
      console.error('[admin/program-series GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramSeriesCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program series payload.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const created = await createProgramSeries(parsed.data);
      return res.status(201).json(created);
    } catch (err) {
      console.error('[admin/program-series POST] error:', err);
      const msg = err instanceof Error ? err.message : 'Server error';
      const status = /duplicate|unique/i.test(msg) ? 409 : 500;
      return res.status(status).json({ error: msg });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
