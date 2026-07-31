/**
 * Package 3 — Central person-scoped authorization for Meal/Recipe library writes.
 *
 * One server-side path for all MealDocument writes:
 *   requireMealLibraryWrite → Package 2 journal auth + entitlement + personId
 *
 * Rules:
 *   - Fail closed on missing person / journal access
 *   - personId ALWAYS from session (never client body/query as truth)
 *   - Read paths may use staff view-as via resolveMealLibraryReadPerson
 *
 * NEVER import from client/browser code.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireCallerJournalAccess,
  requireJournalAuth,
  resolveJournalTargetPerson,
  type JournalAccessContext,
} from '@/lib/access/requireJournalAccess';

export type MealLibraryAccessContext = JournalAccessContext;

/**
 * Authenticate + resolve caller personId + require journal access for writes.
 * Returns null after sending 401/403.
 */
export async function requireMealLibraryWrite(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<MealLibraryAccessContext | null> {
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return null;
  if (!(await requireCallerJournalAccess(res, ctx))) return null;
  return ctx;
}

/**
 * Resolve the personId for a Meal Library read (self or staff view-as).
 * Returns null after sending 403.
 */
export async function resolveMealLibraryReadPerson(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: MealLibraryAccessContext,
): Promise<string | null> {
  return resolveJournalTargetPerson(req, res, ctx);
}

/**
 * Auth-only (no journal check) — rare; prefer requireMealLibraryWrite for writes.
 */
export async function requireMealLibraryAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<MealLibraryAccessContext | null> {
  return requireJournalAuth(req, res);
}
