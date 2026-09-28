/**
 * POST /api/journal/food/haul-invitations/:invitationId/accept
 *
 * Accepts an invitation for the signed-in caller. Auth-only (no journal
 * entitlement). Membership is activated only when the Auth user's CONFIRMED
 * email equals the invitation target and the caller's linked people record
 * matches it; the request body is ignored entirely.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth } from '@/lib/access/requireJournalAccess';
import { acceptHaulInvitation } from '@/lib/plans/groceryHaul/haulCollaboration';
import {
  respondCollaborationError,
  singleQueryString,
} from '@/lib/plans/groceryHaul/collaborationApiErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const invitationId = singleQueryString(req.query.invitationId);
  if (!invitationId) return res.status(400).json({ error: 'invitationId is required' });

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  try {
    const result = await acceptHaulInvitation({
      actorPersonId: ctx.personId,
      authUserId: ctx.user.id,
      invitationId,
    });
    return res.status(200).json({ result });
  } catch (err) {
    return respondCollaborationError(res, err, '/journal/food/haul-invitations/:invitationId/accept');
  }
}
