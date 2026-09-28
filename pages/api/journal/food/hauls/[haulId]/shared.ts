/**
 * GET /api/journal/food/hauls/:haulId/shared
 *
 * Read-only Haul detail for the owner OR an accepted contributor. Reuses the
 * owner read model (getGroceryHaulDetail) after a database membership check;
 * non-members get 404. Contributor identity comes from the session only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireHaulMemberAccess } from '@/lib/access/requireHaulAccess';
import { getSharedGroceryHaulDetail } from '@/lib/plans/groceryHaul/haulCollaboration';
import {
  respondCollaborationError,
  singleQueryString,
} from '@/lib/plans/groceryHaul/collaborationApiErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = singleQueryString(req.query.haulId);
  if (!haulId) return res.status(400).json({ error: 'haulId is required' });

  const ctx = await requireHaulMemberAccess(req, res, haulId);
  if (!ctx) return;

  try {
    const shared = await getSharedGroceryHaulDetail({ actorPersonId: ctx.personId, haulId });
    return res.status(200).json(shared);
  } catch (err) {
    return respondCollaborationError(res, err, '/journal/food/hauls/:haulId/shared');
  }
}
