/**
 * GET /api/journal/meals/documents/[id]
 *
 * Meal Object Foundation — Packet 8. Person-scoped, READ-ONLY detail for a
 * single canonical MealDocument. The Meal Library list/search endpoint (P6)
 * returns a lightweight projection without components/steps; this endpoint
 * hydrates the FULL document so /app/meals can render ingredients/components
 * and instructions on demand.
 *
 * Auth: read path. personId is resolved from the session/access context via
 * resolveJournalTargetPerson (self, or staff view-as-client with journal_read
 * scope) — IDENTICAL to the P6 search endpoint so the detail view is scoped to
 * the same person as the list it expands from. Person identity is NEVER taken
 * from the request body/query as a trusted value.
 *
 * Returns:
 *   200 { document: MealDocument }   — full canonical document for personId
 *   404 { error }                    — missing OR not owned by personId
 *   405 { error }                    — any method other than GET
 *
 * This route performs NO writes, NO AI, NO nutrition recompute, and does not
 * touch the list/search endpoint, branded food search, or any log behavior.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { getMealDocumentForPerson } from '@/lib/meals/mealDocumentServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing meal document id.' });

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    const personId = await resolveJournalTargetPerson(req, res, ctx);
    if (!personId) return; // 403 already sent

    // Person scope is enforced server-side inside the service (owner+id match).
    // A missing OR non-owned document both surface as null ⇒ 404 (no leak of
    // whether the id exists for another person).
    const document = await getMealDocumentForPerson(personId, id);
    if (!document) {
      return res.status(404).json({ error: 'Meal document not found.' });
    }

    return res.status(200).json({ document });
  } catch (err) {
    console.error('[API /journal/meals/documents/:id GET] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
