/**
 * Journal API access guards
 *
 * Shared helpers for ALL pages/api/journal/* routes.
 *
 * requireJournalAuth             — authenticate + resolve callerPersonId (no journal check)
 * resolveJournalTargetPerson     — for GET routes: resolves ?person_id=, enforces journal access
 *                                  on the resolved person (self or client)
 * requireCallerJournalAccess     — for write paths: verifies caller has journal access
 * requireJournalAccess           — convenience: requireJournalAuth + requireCallerJournalAccess
 *
 * ── GET routes (read, supports view-as-client) ──
 *
 *   const ctx = await requireJournalAuth(req, res);
 *   if (!ctx) return;
 *   const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
 *   if (!targetPersonId) return;        // 403 already sent
 *
 * ── Write routes (self-only) ──
 *
 *   const ctx = await requireJournalAuth(req, res);
 *   if (!ctx) return;
 *   if (!(await requireCallerJournalAccess(res, ctx))) return;
 *   const { personId } = ctx;           // always the caller's own personId
 *
 * NEVER import this file from client/browser code.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi, type AuthenticatedUser } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { hasJournalAccess } from '@/lib/access/accessService';
import { canActOnClient } from '@/lib/access/accessLinkService';

export interface JournalAccessContext {
  user: AuthenticatedUser;
  personId: string;
}

// ============================================================================
// Auth only (no journal access check)
// ============================================================================

/**
 * Authenticate the caller and resolve their person_id.
 *
 * Does NOT check whether the caller has journal access — that is handled
 * downstream by resolveJournalTargetPerson (reads) or
 * requireCallerJournalAccess (writes).
 *
 * Returns { user, personId } on success (personId = caller's own).
 * Returns null after sending a 401/403 JSON response on failure.
 */
export async function requireJournalAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<JournalAccessContext | null> {
  // 1. Authenticate
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  // 2. Resolve person_id
  const personId = await getPersonIdFromAuthUserId(user.id);
  if (!personId) {
    res.status(403).json({ error: 'No person record found. Please contact support.' });
    return null;
  }

  return { user, personId };
}

// ============================================================================
// Caller journal access check (for write paths)
// ============================================================================

/**
 * Verify the caller's own journal access.
 *
 * Use this in write branches (POST/PATCH/DELETE) which are always self-only.
 * Returns true on success, false after sending a 403 response.
 */
export async function requireCallerJournalAccess(
  res: NextApiResponse,
  ctx: JournalAccessContext,
): Promise<boolean> {
  const allowed = await hasJournalAccess(ctx.personId);
  if (!allowed) {
    res.status(403).json({ error: 'Journal access required' });
    return false;
  }
  return true;
}

// ============================================================================
// Convenience: auth + caller journal access (backward-compat shortcut)
// ============================================================================

/**
 * Authenticate the caller AND verify they have journal access.
 *
 * Convenience wrapper that calls requireJournalAuth then checks
 * hasJournalAccess(callerPersonId).  Use for simple self-only routes
 * or write-only handlers.
 */
export async function requireJournalAccess(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<JournalAccessContext | null> {
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return null;

  if (!(await requireCallerJournalAccess(res, ctx))) return null;

  return ctx;
}

// ============================================================================
// Read-path resolver: supports optional ?person_id= for staff view-as-client
// ============================================================================

/**
 * Resolve the target person_id for journal GET routes.
 *
 * Self requests (no ?person_id= or same as caller):
 *   - Checks hasJournalAccess(callerPersonId)
 *   - Returns callerPersonId on success
 *
 * View-as-client requests (?person_id= different from caller):
 *   - Does NOT require caller to have journal access
 *   - Checks canActOnClient (admin bypass OR active access link, journal_read scope)
 *   - Checks hasJournalAccess(targetPersonId) — target must be entitled
 *   - Returns targetPersonId on success
 *
 * Returns the resolved personId on success.
 * Returns null after sending a 403 JSON response on failure.
 */
export async function resolveJournalTargetPerson(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: JournalAccessContext,
): Promise<string | null> {
  const { user, personId: callerPersonId } = ctx;
  const personIdParam = req.query.person_id;

  // ------------------------------------------------------------------
  // Self request (fast path — one extra query for journal access check)
  // ------------------------------------------------------------------
  if (
    !personIdParam ||
    typeof personIdParam !== 'string' ||
    personIdParam.length === 0 ||
    personIdParam === callerPersonId
  ) {
    const allowed = await hasJournalAccess(callerPersonId);
    if (!allowed) {
      res.status(403).json({ error: 'Journal access required' });
      return null;
    }
    return callerPersonId;
  }

  // ------------------------------------------------------------------
  // View-as-client request
  // ------------------------------------------------------------------
  const targetPersonId = personIdParam;

  // 1. Caller must be authorised to view the target's data
  //    (admin always passes; otherwise needs active access link)
  const authorised = await canActOnClient(
    user.role,
    callerPersonId,
    targetPersonId,
    'journal_read',
  );
  if (!authorised) {
    res.status(403).json({ error: 'Access denied to this person\'s journal data' });
    return null;
  }

  // 2. Target must themselves have journal access (can't view an un-entitled client)
  const targetEntitled = await hasJournalAccess(targetPersonId);
  if (!targetEntitled) {
    res.status(403).json({ error: 'Target person does not have journal access' });
    return null;
  }

  return targetPersonId;
}
