/**
 * Admin API: Program Assignments — List & Create (Plans Phase 8)
 *
 * GET  /api/admin/program-assignments
 *   Filters: person_id, program_slug, status, acquisition_source, limit, offset.
 *
 * POST /api/admin/program-assignments
 *   Body: ProgramAssignmentCreateSchema. Creating with status='active' and
 *   no active_from/active_to immediately contributes inheritance into the
 *   Plans consumer path for the referenced person.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  ProgramAcquisitionSourceSchema,
  ProgramAssignmentCreateSchema,
  ProgramAssignmentStatusSchema,
} from '@/lib/plans/validators';
import {
  createAssignment,
  listAssignments,
} from '@/lib/plans/programAssignmentServerService';
import type { ProgramAssignment } from '@/lib/plans/types';

interface ListResponse {
  rows: ProgramAssignment[];
  total: number;
  limit: number;
  offset: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ListResponse | ProgramAssignment | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const {
        person_id,
        program_slug,
        status,
        acquisition_source,
        limit,
        offset,
      } = req.query;

      const parsedStatus = typeof status === 'string' && status
        ? ProgramAssignmentStatusSchema.safeParse(status)
        : null;
      const parsedSource = typeof acquisition_source === 'string' && acquisition_source
        ? ProgramAcquisitionSourceSchema.safeParse(acquisition_source)
        : null;

      const result = await listAssignments({
        personId: typeof person_id === 'string' && person_id ? person_id : undefined,
        programSlug: typeof program_slug === 'string' && program_slug ? program_slug : undefined,
        status: parsedStatus?.success ? parsedStatus.data : undefined,
        acquisitionSource: parsedSource?.success ? parsedSource.data : undefined,
        limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
        offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
      });
      return res.status(200).json(result);
    } catch (err) {
      console.error('[admin/program-assignments GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramAssignmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid assignment payload.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const created = await createAssignment(parsed.data, {
        createdByAuthUserId: user.id ?? null,
      });
      return res.status(201).json(created);
    } catch (err) {
      console.error('[admin/program-assignments POST] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
