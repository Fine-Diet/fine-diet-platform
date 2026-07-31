/**
 * POST /api/journal/meals/documents/[id]/archive
 *
 * Package 3 — soft-archive or restore a MealDocument. Prefer archive over
 * destructive deletion when downstream references may exist. Archived
 * documents remain readable via GET /documents/[id].
 *
 * Body: { action?: 'archive' | 'restore' }
 *   - omitted / undefined `action` defaults to 'archive'
 *   - present null, '', whitespace, arrays, objects, or unsupported strings → 400
 *
 * Auth: self-only write via requireMealLibraryWrite. personId from session.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import { requireMealLibraryWrite } from '@/lib/meals/requireMealLibraryAccess';
import {
  MealDocumentValidationError,
  archiveMealDocumentForPerson,
  restoreMealDocumentForPerson,
} from '@/lib/meals/mealDocumentServerService';
import { isMealDocumentArchived } from '@/lib/meals/lifecycle';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing meal document id.' });

  try {
    const ctx = await requireMealLibraryWrite(req, res);
    if (!ctx) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    // Default ONLY when the property is absent / undefined. Any present value
    // that is not exactly 'archive' | 'restore' (including null, '', whitespace,
    // arrays, objects) must 400 with no archive/restore call.
    let action: 'archive' | 'restore';
    if (!Object.prototype.hasOwnProperty.call(body, 'action') || body.action === undefined) {
      action = 'archive';
    } else if (body.action === 'archive' || body.action === 'restore') {
      action = body.action;
    } else {
      return res.status(400).json({
        error: 'Invalid action. Valid values: archive, restore.',
      });
    }

    try {
      const document =
        action === 'restore'
          ? await restoreMealDocumentForPerson(ctx.personId, id)
          : await archiveMealDocumentForPerson(ctx.personId, id);

      if (!document) {
        return res.status(404).json({ error: 'Meal document not found.' });
      }

      return res.status(200).json({
        document,
        archived: isMealDocumentArchived(document),
        action,
      });
    } catch (err) {
      if (err instanceof MealDocumentValidationError) {
        return res.status(400).json({ error: err.message, details: err.errors });
      }
      throw err;
    }
  } catch (err) {
    console.error('[API /journal/meals/documents/:id/archive POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
