/**
 * Admin API: Program Guidance — Active for Person (Plans Phase 7)
 *
 * GET /api/admin/program-guidance/for-person?person_id=UUID
 *   Returns every active guidance row currently affecting the given
 *   person, sorted by priority DESC. Powers the admin "what's
 *   currently influencing this user" inspection card.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { listActiveGuidanceForPerson } from '@/lib/plans/programGuidanceAdminServerService';
import type { ProgramPlanGuidance } from '@/lib/plans/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ rows: ProgramPlanGuidance[] } | { error: string }>,
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
    const rows = await listActiveGuidanceForPerson(personId);
    return res.status(200).json({ rows });
  } catch (err) {
    console.error('[admin/program-guidance for-person] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
