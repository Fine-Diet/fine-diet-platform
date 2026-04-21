/**
 * Admin API: Program Assignments — Per-Person Inspection (Plans Phase 8)
 *
 * GET /api/admin/program-assignments/for-person?person_id=UUID
 *   Returns the full inheritance resolution for a person, including:
 *     - every assignment (any status)
 *     - active assignments currently contributing inheritance
 *     - the merge-ordered resolved guidance set with provenance
 *     - timestamp of the resolution snapshot
 *
 * Powers the admin "what programs/guidance influence this user" UI and
 * answers the Packet 8 inspection acceptance criterion.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  listAssignments,
  resolveInheritedGuidanceForPerson,
} from '@/lib/plans/programAssignmentServerService';
import type {
  GuidanceResolutionResult,
  ProgramAssignment,
} from '@/lib/plans/types';

interface ForPersonResponse {
  person_id: string;
  all_assignments: ProgramAssignment[];
  resolution: GuidanceResolutionResult;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ForPersonResponse | { error: string }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const personId = typeof req.query.person_id === 'string' ? req.query.person_id : '';
  if (!personId) {
    return res.status(400).json({ error: 'person_id is required.' });
  }

  try {
    const [all, resolution] = await Promise.all([
      listAssignments({ personId, limit: 200 }),
      resolveInheritedGuidanceForPerson(personId),
    ]);
    return res.status(200).json({
      person_id: personId,
      all_assignments: all.rows,
      resolution,
    });
  } catch (err) {
    console.error('[admin/program-assignments for-person] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
