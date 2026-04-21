/**
 * Admin API: Food object candidate lookup (Plans Phase 15)
 *
 * GET /api/admin/food-objects/search?q=<substring>&limit=<n>
 *
 * Lightweight picker used by the missing-item-requests admin console
 * to link a request to an existing trusted food object. Not a full
 * food-object management endpoint — query/limit only.
 *
 * Auth: admin or editor.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { FoodObjectCandidateQuerySchema } from '@/lib/missingItems/validators';
import { searchFoodObjectCandidates } from '@/lib/missingItems/missingItemRequestServerService';
import type { FoodObjectCandidate } from '@/lib/missingItems/types';

interface SuccessBody {
  rows: FoodObjectCandidate[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessBody | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = FoodObjectCandidateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const rows = await searchFoodObjectCandidates(
      parsed.data.q,
      parsed.data.limit ?? 15,
    );
    return res.status(200).json({ rows });
  } catch (err) {
    console.error('[admin/food-objects/search GET] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
