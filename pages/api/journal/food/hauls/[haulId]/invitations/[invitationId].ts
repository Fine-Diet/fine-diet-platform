/**
 * POST /api/journal/food/hauls/:haulId/invitations/:invitationId
 *   Resend delivery for an existing pending invitation (no new row).
 *
 * DELETE /api/journal/food/hauls/:haulId/invitations/:invitationId
 *
 * OWNER only. Revokes a pending invitation or removes an accepted member.
 * Contributor items and their attribution are kept.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  resendHaulInvitation,
  revokeHaulInvitation,
} from '@/lib/plans/groceryHaul/haulCollaboration';
import {
  respondCollaborationError,
  singleQueryString,
} from '@/lib/plans/groceryHaul/collaborationApiErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    res.setHeader('Allow', ['DELETE', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = singleQueryString(req.query.haulId);
  const invitationId = singleQueryString(req.query.invitationId);
  if (!haulId || !invitationId) {
    return res.status(400).json({ error: 'haulId and invitationId are required' });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;

  try {
    if (req.method === 'POST') {
      const result = await resendHaulInvitation({
        ownerPersonId: ctx.personId,
        haulId,
        invitationId,
      });
      return res.status(200).json({ result });
    }
    const result = await revokeHaulInvitation({
      ownerPersonId: ctx.personId,
      haulId,
      invitationId,
    });
    return res.status(200).json({ result });
  } catch (err) {
    return respondCollaborationError(res, err, '/journal/food/hauls/:haulId/invitations/:invitationId');
  }
}
