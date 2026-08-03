/**
 * POST /api/journal/meals/documents/[id]/log
 *
 * Meal Object Foundation — Packet 5. Log a person's canonical MealDocument as
 * EXACTLY ONE grouped journal intake entry (payload.meal_group). The meal shows
 * up as a single first-level entry that still knows its components — not as a
 * pile of per-ingredient rows.
 *
 * Body (all optional):
 *   {
 *     "date": "YYYY-MM-DD",        // local date (combined with time, default 12:00)
 *     "time": "HH:mm",             // local time-of-day
 *     "occurred_at": "<ISO>",      // alternative to date/time (takes precedence)
 *     "consumed_servings": 1,      // finite > 0, default 1
 *     "note": "optional instance note"
 *   }
 *
 * Auth: self-only write. personId is derived from the authenticated session
 * (NEVER from the request body); the MealDocument must be owned by personId.
 *
 * This route is intentionally isolated and adds NO UI behavior. It does not
 * touch flat food logging, saved-meal apply, planned-meal execution, log
 * rendering, or branded food search.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import { requireMealLibraryWrite } from '@/lib/meals/requireMealLibraryAccess';
import {
  GroupedMealLogValidationError,
  MealDocumentNotFoundError,
  logMealDocumentForPerson,
  type GroupedMealLogInput,
} from '@/lib/meals/groupedMealLoggingService';

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

    // Person identity comes from the session — never the request body.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const input: GroupedMealLogInput = {
      date: typeof body.date === 'string' ? body.date : undefined,
      time: typeof body.time === 'string' ? body.time : undefined,
      occurred_at: typeof body.occurred_at === 'string' ? body.occurred_at : undefined,
      consumed_servings:
        typeof body.consumed_servings === 'number' ? body.consumed_servings : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    };

    try {
      const entry = await logMealDocumentForPerson(ctx.personId, id, input);
      return res.status(201).json({ entry });
    } catch (err) {
      if (err instanceof MealDocumentNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof GroupedMealLogValidationError) {
        return res
          .status(400)
          .json({ error: err.message, details: err.errors });
      }
      throw err;
    }
  } catch (err) {
    console.error('[API /journal/meals/documents/:id/log POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
