/**
 * Admin API: Missing-item requests — list (Plans Phase 14)
 *
 * GET /api/admin/missing-item-requests?status=open&context=journal_search&q=&limit=50&offset=0
 *
 * Returns the paginated backlog plus open/resolved/dismissed counters.
 * Creation happens implicitly from runtime fall-through paths (Journal
 * search zero-results, Import matcher `guessed`/`none` tiers). There is
 * deliberately no POST here — admins resolve/dismiss, they don't author.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { MissingItemListQuerySchema } from '@/lib/missingItems/validators';
import {
  getStatusCounts,
  listRequests,
} from '@/lib/missingItems/missingItemRequestServerService';
import type {
  MissingItemRequest,
  MissingItemStatus,
} from '@/lib/missingItems/types';

interface SuccessBody {
  rows: MissingItemRequest[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<MissingItemStatus, number>;
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

  const parsed = MissingItemListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const [list, counts] = await Promise.all([
      listRequests(parsed.data),
      getStatusCounts(),
    ]);
    return res.status(200).json({ ...list, counts });
  } catch (err) {
    console.error('[admin/missing-item-requests GET] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
