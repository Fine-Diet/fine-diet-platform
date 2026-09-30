/**
 * POST /api/journal/food/hauls/:haulId/contributor-items
 *
 * Adds a Haul-only item attributed to the caller. Only an ACCEPTED contributor
 * may add (the RPC rejects owners and everyone else). The body carries only
 * name/quantity/unit: attribution, owner, origin and Haul come from the session
 * and the database, never from the request.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireHaulMemberAccess } from '@/lib/access/requireHaulAccess';
import { addHaulContributorItem } from '@/lib/plans/groceryHaul/haulCollaboration';
import {
  respondCollaborationError,
  singleQueryString,
} from '@/lib/plans/groceryHaul/collaborationApiErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = singleQueryString(req.query.haulId);
  if (!haulId) return res.status(400).json({ error: 'haulId is required' });

  const ctx = await requireHaulMemberAccess(req, res, haulId);
  if (!ctx) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const item = await addHaulContributorItem({
      actorPersonId: ctx.personId,
      haulId,
      item: {
        name: body.name,
        quantity: body.quantity as number | null | undefined,
        unit: body.unit as string | null | undefined,
      },
    });
    return res.status(201).json({ item });
  } catch (err) {
    return respondCollaborationError(res, err, '/journal/food/hauls/:haulId/contributor-items POST');
  }
}
