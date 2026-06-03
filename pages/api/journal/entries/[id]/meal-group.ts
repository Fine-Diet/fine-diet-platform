/**
 * /api/journal/entries/[id]/meal-group
 *
 * PATCH (Meal Object Foundation — Packet 16): person-scoped SAFE edit of a
 * LOGGED grouped meal journal entry INSTANCE. A logged meal is historical truth
 * for what the user ate; editing it changes ONLY this journal entry payload and
 * marks the instance detached from its source
 * (payload.meal_group.detached_from_source = true). The reusable source
 * MealDocument is NEVER read or written by this route.
 *
 * Auth:
 *   - Self-only write: personId comes from requireCallerJournalAccess / ctx (the
 *     caller's own person). Person identity is NEVER taken from the request
 *     body/query as a trusted value.
 *
 * Returns:
 *   200 { entry, recomputed, needs_review, detached_from_source }
 *   400 { error, details? }   — invalid patch, or the entry is not a grouped meal
 *   404 { error }             — missing OR not owned by personId
 *   405 { error }             — any method other than PATCH (Allow: PATCH)
 *
 * This route performs NO AI, NO food search, NO network nutrition lookups, and
 * does not touch the source MealDocument, branded food search, flat food
 * entries, or daily totals semantics.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  LoggedMealInstanceEditValidationError,
  applyGroupedMealInstanceEditForPerson,
} from '@/lib/meals/loggedMealGroupInstanceEditService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing entry id.' });

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return; // 401/403 already sent

    // Writes are always self-only — personId comes from the session.
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const rawPatch = req.body ?? {};
    try {
      const result = await applyGroupedMealInstanceEditForPerson(ctx.personId, id, rawPatch);

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Journal entry not found.' });
      }
      if (result.status === 'not_grouped') {
        return res.status(400).json({ error: 'Journal entry is not a grouped meal.' });
      }

      return res.status(200).json({
        entry: result.entry,
        recomputed: result.recomputed,
        needs_review: result.needs_review,
        detached_from_source: result.detached_from_source,
      });
    } catch (err) {
      if (err instanceof LoggedMealInstanceEditValidationError) {
        return res.status(400).json({ error: err.message, details: err.errors });
      }
      throw err;
    }
  } catch (err) {
    console.error('[API /journal/entries/:id/meal-group] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
