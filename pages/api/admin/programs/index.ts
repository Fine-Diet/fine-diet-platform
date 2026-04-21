/**
 * Admin API: Programs — List & Create (Plans Phase 12)
 *
 * GET  /api/admin/programs                      — list all
 * POST /api/admin/programs                      — create
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramCreateSchema } from '@/lib/programs/contentValidators';
import {
  createProgram,
  listPrograms,
} from '@/lib/programs/programContentAdminServerService';
import type { Program, ProgramStatus } from '@/lib/programs/contentTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | { rows: Program[]; total: number; limit: number; offset: number }
    | Program
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
        (['draft', 'published', 'archived'] as ProgramStatus[]).includes(
          status as ProgramStatus,
        )
          ? (status as ProgramStatus)
          : undefined;
      const result = await listPrograms({
        status: statusFilter,
        limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
        offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
      });
      return res.status(200).json(result);
    } catch (err) {
      console.error('[admin/programs GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program payload.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const created = await createProgram(parsed.data, {
        createdByAuthUserId: user.id ?? null,
      });
      return res.status(201).json(created);
    } catch (err) {
      console.error('[admin/programs POST] error:', err);
      const msg = err instanceof Error ? err.message : 'Server error';
      const status = /duplicate|unique/i.test(msg) ? 409 : 500;
      return res.status(status).json({ error: msg });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
