/**
 * PATCH  /api/journal/plans/meals/:mealId
 *   Accepts either:
 *     - partial patch { name?, meal_type?, payload? } (manual edit), OR
 *     - { ai_replacement: AiPlannedMeal } to swap in a validated AI result.
 *   All paths stamp nds_version/classifier_version via the service.
 *
 * DELETE /api/journal/plans/meals/:mealId — cascade-safe remove.
 *
 * Auth: self-only writes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  getPlannedMeal,
  updatePlannedMeal,
  deletePlannedMeal,
} from '@/lib/plans/planServerService';
import { AiPlannedMealSchema } from '@/lib/plans/validators';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mealId = req.query.mealId;
  if (typeof mealId !== 'string' || !mealId) {
    return res.status(400).json({ error: 'mealId is required' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as Record<string, unknown>;

      if (body.ai_replacement) {
        const parsed = AiPlannedMealSchema.safeParse(body.ai_replacement);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: 'ai_replacement failed validation', detail: parsed.error.issues });
        }
        const rep = parsed.data;
        const meal = await updatePlannedMeal(personId, mealId, {
          name: rep.name,
          meal_type: rep.meal_type,
          payload: rep.payload as Record<string, unknown>,
          protein_score_10: rep.protein_score_10,
          is_main_meal: rep.is_main_meal,
          psq_multiplier: rep.psq_multiplier,
          meal_derived_data: rep.meal_derived_data as Record<string, unknown>,
          nds_confidence: rep.nds_confidence,
          source_imported_meal_id: rep.source_imported_meal_id ?? null,
        });
        if (!meal) return res.status(404).json({ error: 'Planned meal not found' });
        return res.status(200).json({ meal });
      }

      const existing = await getPlannedMeal(personId, mealId);
      if (!existing) return res.status(404).json({ error: 'Planned meal not found' });

      const patch: Parameters<typeof updatePlannedMeal>[2] = {};
      if (typeof body.name === 'string' || body.name === null) {
        patch.name = body.name as string | null;
      }
      if (
        body.meal_type === 'breakfast' ||
        body.meal_type === 'lunch' ||
        body.meal_type === 'dinner' ||
        body.meal_type === 'snack' ||
        body.meal_type === 'other'
      ) {
        patch.meal_type = body.meal_type;
      }
      if (body.payload && typeof body.payload === 'object') {
        patch.payload = body.payload as Record<string, unknown>;
      }

      const meal = await updatePlannedMeal(personId, mealId, patch);
      if (!meal) return res.status(404).json({ error: 'Planned meal not found' });
      return res.status(200).json({ meal });
    }

    if (req.method === 'DELETE') {
      await deletePlannedMeal(personId, mealId);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans/meals/:mealId] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
