/**
 * GET /api/journal/food/haul-invitations
 *
 * Pending Haul invitations addressed to the signed-in caller. Auth-only (no
 * journal entitlement): an invitee may not have a subscription. Seeing an
 * invitation is not accepting it.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth } from '@/lib/access/requireJournalAccess';
import { listPendingHaulInvitationsForPerson } from '@/lib/plans/groceryHaul/haulCollaboration';
import { respondCollaborationError } from '@/lib/plans/groceryHaul/collaborationApiErrors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  try {
    const invitations = await listPendingHaulInvitationsForPerson(ctx.personId);
    return res.status(200).json({ invitations });
  } catch (err) {
    return respondCollaborationError(res, err, '/journal/food/haul-invitations');
  }
}
