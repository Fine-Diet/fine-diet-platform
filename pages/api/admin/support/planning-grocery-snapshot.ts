/**
 * GET /api/admin/support/planning-grocery-snapshot?person_id=UUID
 *
 * Packet 59 — admin-only, read-only support snapshot for planning/grocery
 * state across stabilized table-backed storage boundaries.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getPlanningGrocerySupportSnapshot,
  type PlanningGrocerySupportSnapshot,
} from '@/lib/admin/planningSupportSnapshotService';

type ResponseBody = PlanningGrocerySupportSnapshot | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  const user = await requireRoleFromApi(req, res, ['admin']);
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
    const snapshot = await getPlanningGrocerySupportSnapshot(personId);
    return res.status(200).json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    console.error('[admin/support/planning-grocery-snapshot] error:', err);
    return res.status(500).json({ error: message });
  }
}
