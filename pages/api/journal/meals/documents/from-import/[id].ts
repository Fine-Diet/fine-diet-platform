/**
 * POST /api/journal/meals/documents/from-import/[id]
 *
 * Meal Object Foundation — Packet 4. Convert a reviewed `imported_meals` draft
 * (owned by the caller) into a canonical MealDocument in meal_documents.
 *
 * Body:
 *   - {}                                    → save as draft / needs_review.
 *   - { yield: { servings, yield_label?, serving_label? } }
 *                                           → confirm yield + save (recipe can
 *                                             become a confirmed library object).
 *
 * A confirmed recipe REQUIRES an explicit, valid yield — yield is never
 * inferred or silently confirmed. Missing/uncertain yield ⇒ draft only.
 *
 * Auth: self-only write. personId is derived from the authenticated session
 * (never from the request body); the imported meal must be owned by personId.
 *
 * This route is intentionally isolated and adds NO UI behavior. It does not
 * touch saved-meal apply, planned-meal execution, grouped journal writes, log
 * rendering, or branded food search.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { requireMealLibraryWrite } from '@/lib/meals/requireMealLibraryAccess';
import { MealDocumentValidationError } from '@/lib/meals/mealDocumentServerService';
import {
  ImportedMealNotFoundError,
  MealYieldConfirmationError,
  confirmImportedMealYieldAndSave,
  saveImportedMealAsMealDocumentDraft,
} from '@/lib/meals/importToMealDocumentService';

const RequestSchema = z.object({
  yield: z
    .object({
      servings: z.number(),
      yield_label: z.string().nullable().optional(),
      serving_label: z.string().nullable().optional(),
    })
    .optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing import id.' });

  try {
    const ctx = await requireMealLibraryWrite(req, res);
    if (!ctx) return;

    const parsed = RequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }

    try {
      if (parsed.data.yield) {
        const result = await confirmImportedMealYieldAndSave(
          ctx.personId,
          id,
          parsed.data.yield,
        );
        return res.status(201).json({
          meal_document: result.document,
          confirmed: result.confirmed,
        });
      }

      const document = await saveImportedMealAsMealDocumentDraft(ctx.personId, id);
      return res.status(201).json({ meal_document: document, confirmed: false });
    } catch (err) {
      if (err instanceof ImportedMealNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof MealYieldConfirmationError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof MealDocumentValidationError) {
        return res.status(400).json({ error: err.message, details: err.errors });
      }
      throw err;
    }
  } catch (err) {
    console.error(
      '[API /journal/meals/documents/from-import/:id POST] error:',
      err,
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}
