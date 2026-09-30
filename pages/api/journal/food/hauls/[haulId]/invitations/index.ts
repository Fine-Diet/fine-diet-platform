/**
 * GET/POST /api/journal/food/hauls/:haulId/invitations
 *
 * OWNER only (existing journal access resolution). The owner's identity is the
 * session's person; the body only ever carries the invitee's email, which is an
 * invitation target and never proof of anyone's identity.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  createHaulInvitation,
  listHaulInvitationsForOwner,
} from '@/lib/plans/groceryHaul/haulCollaboration';
import {
  respondCollaborationError,
  singleQueryString,
} from '@/lib/plans/groceryHaul/collaborationApiErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = singleQueryString(req.query.haulId);
  if (!haulId) return res.status(400).json({ error: 'haulId is required' });

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;

  try {
    if (req.method === 'GET') {
      const invitations = await listHaulInvitationsForOwner({
        ownerPersonId: ctx.personId,
        haulId,
      });
      return res.status(200).json({ invitations });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await createHaulInvitation({
      ownerPersonId: ctx.personId,
      haulId,
      email: body.email,
      ...(body.deliver === false ? { deliver: false } : {}),
    });
    return res.status(result.outcome === 'created' ? 201 : 200).json({ result });
  } catch (err) {
    return respondCollaborationError(res, err, `/journal/food/hauls/:haulId/invitations ${req.method}`);
  }
}
