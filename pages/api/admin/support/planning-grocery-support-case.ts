/**
 * GET /api/admin/support/planning-grocery-support-case
 *
 * Packet 64 — admin-only, read-only planning/grocery support case export.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getPlanningGrocerySupportCase,
  type PlanningGrocerySupportCase,
} from '@/lib/admin/planningGrocerySupportCaseService';

type ResponseBody = PlanningGrocerySupportCase | { error: string };

function parseLimit(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

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

  const personId = typeof req.query.person_id === 'string' ? req.query.person_id.trim() : '';
  if (!personId) {
    return res.status(400).json({ error: 'person_id is required.' });
  }

  try {
    const supportCase = await getPlanningGrocerySupportCase({
      person_id: personId,
      anomaly_limit: parseLimit(req.query.anomaly_limit),
      include_details: parseBoolean(req.query.include_details),
    });
    return res.status(200).json(supportCase);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    if (message === 'Person not found.') {
      return res.status(404).json({ error: message });
    }
    console.error('[admin/support/planning-grocery-support-case] error:', err);
    return res.status(500).json({ error: message });
  }
}
