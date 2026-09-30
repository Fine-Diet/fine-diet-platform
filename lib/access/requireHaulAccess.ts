/**
 * Haul membership-aware API access guard (Invite to Haul v1, Phase B1).
 *
 * Owner-only Haul routes use requireOwnerJournalHaulAccess (journal + ownership).
 * requireHaulMemberAccess is for routes a contributor may call. It never impersonates
 * the owner: the caller's own person id is always the actor, and the role is
 * derived from the database, never from the request.
 *
 *   owner       — grocery_hauls.person_id = caller. Still needs the journal
 *                 entitlement, exactly like every other owner Haul route.
 *   contributor — an ACCEPTED grocery_haul_invitations row for the caller.
 *                 Deliberately NOT gated on a journal entitlement: an invited
 *                 friend must be able to help without a subscription, and their
 *                 reach is limited to that one Haul by the RPC/RLS contract.
 *   anyone else — 404 (never 403) so a Haul's existence is not disclosed.
 *
 * NEVER import this file from client/browser code.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireCallerJournalAccess,
  requireJournalAuth,
  type JournalAccessContext,
} from '@/lib/access/requireJournalAccess';
import {
  resolveHaulViewerAccess,
  type HaulViewerAccess,
} from '@/lib/plans/groceryHaul/resolveHaulViewerAccess';

export interface HaulMemberContext extends JournalAccessContext {
  access: HaulViewerAccess;
}

const HAUL_NOT_FOUND_BODY = { error: 'Grocery haul not found.' };

/**
 * Owner-only canonical Haul read/write (GET/PATCH /api/journal/food/hauls/:haulId).
 *
 * Authenticates and resolves membership first. Contributors and non-members get
 * 404 so clients can fall back to the shared read endpoint. Owners without
 * journal entitlement get 403.
 */
export async function requireOwnerJournalHaulAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  haulId: string,
): Promise<JournalAccessContext | null> {
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return null;

  const access = await resolveHaulViewerAccess(ctx.personId, haulId);
  if (!access || access.role !== 'owner') {
    res.status(404).json(HAUL_NOT_FOUND_BODY);
    return null;
  }

  if (!(await requireCallerJournalAccess(res, ctx))) return null;

  return ctx;
}

export async function requireHaulMemberAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  haulId: string,
): Promise<HaulMemberContext | null> {
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return null;

  const access = await resolveHaulViewerAccess(ctx.personId, haulId);
  if (!access) {
    res.status(404).json({ error: 'Grocery haul not found.' });
    return null;
  }

  if (access.role === 'owner' && !(await requireCallerJournalAccess(res, ctx))) {
    return null;
  }

  return { ...ctx, access };
}
