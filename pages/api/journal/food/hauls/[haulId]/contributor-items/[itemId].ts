/**
 * PATCH/DELETE /api/journal/food/hauls/:haulId/contributor-items/:itemId
 *
 * A contributor may change or remove ONLY their own Haul-only items; the owner
 * may change or remove any contributor item. Source-list snapshot rows are never
 * reachable here (the RPC rejects them). Provenance fields are not accepted.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireHaulMemberAccess } from '@/lib/access/requireHaulAccess';
import {
  removeHaulContributorItem,
  updateHaulContributorItem,
  type HaulContributorItemPatch,
} from '@/lib/plans/groceryHaul/haulCollaboration';
import {
  respondCollaborationError,
  singleQueryString,
} from '@/lib/plans/groceryHaul/collaborationApiErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', ['PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = singleQueryString(req.query.haulId);
  const itemId = singleQueryString(req.query.itemId);
  if (!haulId || !itemId) {
    return res.status(400).json({ error: 'haulId and itemId are required' });
  }

  const ctx = await requireHaulMemberAccess(req, res, haulId);
  if (!ctx) return;

  try {
    if (req.method === 'DELETE') {
      const result = await removeHaulContributorItem({
        actorPersonId: ctx.personId,
        haulId,
        itemId,
      });
      return res.status(200).json({ result });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: HaulContributorItemPatch = {};
    if (body.name !== undefined) patch.name = body.name as string;
    if (body.quantity !== undefined) patch.quantity = body.quantity as number;
    if (body.unit !== undefined) patch.unit = body.unit as string | null;
    const item = await updateHaulContributorItem({
      actorPersonId: ctx.personId,
      haulId,
      itemId,
      patch,
    });
    return res.status(200).json({ item });
  } catch (err) {
    return respondCollaborationError(
      res,
      err,
      `/journal/food/hauls/:haulId/contributor-items/:itemId ${req.method}`,
    );
  }
}
