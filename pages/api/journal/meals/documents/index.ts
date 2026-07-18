/**
 * POST /api/journal/meals/documents
 *
 * Plans Authoring Convergence — Phase 2. Create a canonical MealDocument
 * directly from the shared Meal Composer's 'create' context (Save / Save as
 * Meal). Until this route, MealDocuments could only be created via the
 * import-confirm path (from-import/[id].ts) — there was no hand-built
 * "create a meal from scratch" write path (see docs/design/
 * PLANS-AUTHORING-CONVERGENCE-AUDIT.md §2.5).
 *
 * This route does exactly one thing: validate + persist the posted document
 * via the EXISTING createMealDocumentForPerson service (same validation,
 * same person-scoping, same table as every other MealDocument write). It
 * does not touch imports, grouped logging, or planned-meal execution. GET
 * (list/search) is served separately by ./search.ts.
 *
 * Auth: self-only write. personId is derived from the authenticated session
 * and OVERRIDES any person_id in the request body (createMealDocumentForPerson
 * / mealDocumentToStorageRow enforce this) — person identity is never trusted
 * from the client.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import { requireCallerJournalAccess, requireJournalAuth } from '@/lib/access/requireJournalAccess';
import {
  MealDocumentValidationError,
  createMealDocumentForPerson,
} from '@/lib/meals/mealDocumentServerService';
import type { MealDocument } from '@/lib/meals/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const body = (req.body ?? {}) as Partial<MealDocument>;

    try {
      const document = await createMealDocumentForPerson(ctx.personId, body as MealDocument);
      return res.status(201).json({ document });
    } catch (err) {
      if (err instanceof MealDocumentValidationError) {
        return res.status(400).json({ error: err.message, details: err.errors });
      }
      throw err;
    }
  } catch (err) {
    console.error('[API /journal/meals/documents POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
