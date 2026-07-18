/**
 * GET /api/journal/plans/:planId/days/:date — plan day + slots + meals
 *
 * View-as-client supported via ?person_id=.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  getPlanDayByDate,
  listSlotsForDay,
  listMealsForDay,
} from '@/lib/plans/planServerService';
import { listPlannedEatOutEventsForDay } from '@/lib/plans/eatOutServerService';
import { getEntriesByIds } from '@/lib/journal/journalServerService';

/**
 * Corrective fix (Phase 3 authenticated QA — defect plans-vs-log-nutrition-read):
 * a handled planned meal can carry a linked journal_entry_id whose ACTUAL
 * logged nutrition differs from (or exists when) the plan's own payload
 * nutrition is missing. This is a read-only, secondary display lookup for
 * SlotCard — it never writes anything back onto the planned meal, and a
 * meal's plan nutrition is never overwritten by its linked entry's actual
 * nutrition (source separation preserved).
 */
interface LinkedJournalNutrition {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

async function buildLinkedJournalNutrition(
  personId: string,
  meals: Array<{ journal_entry_id: string | null }>,
): Promise<Record<string, LinkedJournalNutrition>> {
  const entryIds = meals
    .map((m) => m.journal_entry_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (entryIds.length === 0) return {};

  const entries = await getEntriesByIds(personId, entryIds);
  const map: Record<string, LinkedJournalNutrition> = {};
  for (const entry of entries) {
    map[entry.id] = {
      calories: typeof entry.payload.calories === 'number' ? entry.payload.calories : null,
      protein_g: typeof entry.payload.macros?.protein === 'number' ? entry.payload.macros.protein : null,
      carbs_g: typeof entry.payload.macros?.carbs === 'number' ? entry.payload.macros.carbs : null,
      fat_g: typeof entry.payload.macros?.fat === 'number' ? entry.payload.macros.fat : null,
    };
  }
  return map;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planId = req.query.planId;
  const date = req.query.date;
  if (typeof planId !== 'string' || !planId) {
    return res.status(400).json({ error: 'planId is required' });
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
    if (!targetPersonId) return;

    const day = await getPlanDayByDate(targetPersonId, planId, date);
    if (!day) return res.status(404).json({ error: 'Plan day not found' });

    const [slots, meals, eat_out_events] = await Promise.all([
      listSlotsForDay(targetPersonId, day.id),
      listMealsForDay(targetPersonId, day.id),
      listPlannedEatOutEventsForDay(targetPersonId, day.id),
    ]);
    const linked_journal_nutrition = await buildLinkedJournalNutrition(targetPersonId, meals);

    return res.status(200).json({ day, slots, meals, eat_out_events, linked_journal_nutrition });
  } catch (err) {
    console.error('[API /journal/plans/:planId/days/:date] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
