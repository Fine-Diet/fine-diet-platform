/**
 * /api/journal/meals/documents/[id]
 *
 * GET (Meal Object Foundation — Packet 8): person-scoped, READ-ONLY detail for
 * a single canonical MealDocument. The Meal Library list/search endpoint (P6)
 * returns a lightweight projection without components/steps; GET hydrates the
 * FULL document so /app/meals can render ingredients/components and instructions
 * on demand.
 *
 * PATCH (Meal Object Foundation — Packet 12): person-scoped SAFE edit of the
 * reusable SOURCE document. Editing a library item changes the document going
 * forward; it NEVER rewrites prior logged journal meal instances (those snapshot
 * their own payload.meal_group). The handler performs NO journal entry writes.
 *
 * Auth:
 *   - GET is a read path: personId is resolved via resolveJournalTargetPerson
 *     (self, or staff view-as-client with journal_read scope) — IDENTICAL to the
 *     P6 search endpoint so detail is scoped to the same person as the list.
 *   - PATCH is a self-only write: personId comes from requireCallerJournalAccess
 *     /ctx (the caller's own person). Person identity is NEVER taken from the
 *     request body/query as a trusted value.
 *
 * Returns:
 *   200 { document }                 — GET: full document / PATCH: updated document
 *   400 { error, details? }          — missing id, or (PATCH) invalid patch
 *   404 { error }                    — missing OR not owned by personId
 *   405 { error }                    — any method other than GET / PATCH
 *
 * This route performs NO AI, NO food search, NO network nutrition lookups, and
 * does not touch the list/search endpoint, branded food search, grouped log
 * rendering, daily totals, or any logged journal entry.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireMealLibraryAuth,
  requireMealLibraryWrite,
  resolveMealLibraryReadPerson,
} from '@/lib/meals/requireMealLibraryAccess';
import { getMealDocumentForPerson } from '@/lib/meals/mealDocumentServerService';
import {
  MealDocumentEditValidationError,
  applyMealDocumentEditForPerson,
} from '@/lib/meals/mealDocumentEditService';
import { MealDocumentValidationError } from '@/lib/meals/mealDocumentServerService';
import { isMealDocumentArchived } from '@/lib/meals/lifecycle';
import { deriveMealNutritionStatus } from '@/lib/meals/nutritionStatus';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing meal document id.' });

  try {
    if (req.method === 'GET') {
      const ctx = await requireMealLibraryAuth(req, res);
      if (!ctx) return;
      const personId = await resolveMealLibraryReadPerson(req, res, ctx);
      if (!personId) return; // 403 already sent

      // Person scope is enforced server-side inside the service (owner+id match).
      // A missing OR non-owned document both surface as null ⇒ 404 (no leak of
      // whether the id exists for another person).
      // Archived documents remain readable here for referenced-read compatibility.
      const document = await getMealDocumentForPerson(personId, id);
      if (!document) {
        return res.status(404).json({ error: 'Meal document not found.' });
      }

      return res.status(200).json({
        document,
        archived: isMealDocumentArchived(document),
        nutrition_status:
          document.nutrition_status ?? deriveMealNutritionStatus(document),
      });
    }

    // ---- PATCH: self-only write via Package 3 meal-library gate ----
    const writeCtx = await requireMealLibraryWrite(req, res);
    if (!writeCtx) return;

    // Person identity comes from the session — never the request body/query.
    const rawPatch = req.body ?? {};
    try {
      const result = await applyMealDocumentEditForPerson(
        writeCtx.personId,
        id,
        rawPatch,
      );
      if (!result) {
        return res.status(404).json({ error: 'Meal document not found.' });
      }
      return res.status(200).json({
        document: result.document,
        review_state_downgraded: result.review_state_downgraded,
        recomputed: result.recomputed,
        archived: isMealDocumentArchived(result.document),
      });
    } catch (err) {
      if (
        err instanceof MealDocumentEditValidationError ||
        err instanceof MealDocumentValidationError
      ) {
        return res.status(400).json({ error: err.message, details: err.errors });
      }
      throw err;
    }
  } catch (err) {
    console.error('[API /journal/meals/documents/:id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
