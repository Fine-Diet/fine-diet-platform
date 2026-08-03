/**
 * POST /api/journal/meals/documents/log-instance
 *
 * Plans Authoring Convergence — Phase 2. Log a shared Meal Composer draft as
 * ONE grouped journal intake entry WITHOUT requiring a prior "Save as Meal".
 * This is the HTTP surface for the composer's compatibility wrapper
 * (lib/meals/composerMealLoggingService.ts::logInMemoryMealDocumentForPerson),
 * which reuses the exact same payload builder and write call as
 * POST /api/journal/meals/documents/[id]/log — it does not change that route,
 * logMealDocumentForPerson's signature, or introduce a new grouped-entry
 * format.
 *
 * Body:
 *   {
 *     "document": <MealDocument>,   // required — the in-memory composer draft
 *     "date": "YYYY-MM-DD",         // optional, combined with time (default 12:00)
 *     "time": "HH:mm",
 *     "occurred_at": "<ISO>",       // takes precedence over date/time
 *     "consumed_servings": 1,       // finite > 0, default 1
 *     "note": "optional instance note"
 *   }
 *
 * Auth: self-only write. personId is derived from the authenticated session
 * (NEVER from the request body) and is stamped onto the document before
 * logging, so a spoofed person_id in the posted draft can never attribute a
 * logged entry to another person.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import { requireMealLibraryWrite } from '@/lib/meals/requireMealLibraryAccess';
import { logInMemoryMealDocumentForPerson } from '@/lib/meals/composerMealLoggingService';
import { GroupedMealLogValidationError, type GroupedMealLogInput } from '@/lib/meals/groupedMealLoggingService';
import type { MealDocument } from '@/lib/meals/types';
import { MealDocumentSchema } from '@/lib/meals/validators';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireMealLibraryWrite(req, res);
    if (!ctx) return;

    const body = (req.body ?? {}) as Record<string, unknown>;

    const parsedDocument = MealDocumentSchema.safeParse(body.document);
    if (!parsedDocument.success) {
      return res.status(400).json({
        error: 'Invalid meal document.',
        details: parsedDocument.error.issues.map((issue) => issue.message),
      });
    }

    // Person identity is never taken from the posted draft — the caller's
    // authenticated personId always wins.
    const document: MealDocument = { ...(parsedDocument.data as MealDocument), person_id: ctx.personId };

    const input: GroupedMealLogInput = {
      date: typeof body.date === 'string' ? body.date : undefined,
      time: typeof body.time === 'string' ? body.time : undefined,
      occurred_at: typeof body.occurred_at === 'string' ? body.occurred_at : undefined,
      consumed_servings: typeof body.consumed_servings === 'number' ? body.consumed_servings : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    };

    try {
      const entry = await logInMemoryMealDocumentForPerson(ctx.personId, document, input);
      return res.status(201).json({ entry });
    } catch (err) {
      if (err instanceof GroupedMealLogValidationError) {
        return res.status(400).json({ error: err.message, details: err.errors });
      }
      throw err;
    }
  } catch (err) {
    console.error('[API /journal/meals/documents/log-instance POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
