/**
 * GET /api/journal/plans/:planId/readiness?date=YYYY-MM-DD[&meal_ids=id1,id2,...]
 *
 * Packet 38/41 — Return per-meal readiness derived from the grocery items for
 * the given plan + date. Exact single-day grocery lists are preferred; when
 * none exists, the newest range list containing the date is used.
 *
 * Query params:
 *   date      YYYY-MM-DD — the day to look up (required)
 *   meal_ids  comma-separated planned meal IDs to include (optional).
 *             Any ID not represented in grocery items gets state "no_list".
 *
 * Response 200:
 *   {
 *     has_list:   boolean,
 *     list_context: GroceryActiveListContext | null,
 *     readiness:  Record<string, MealReadinessResult>
 *   }
 *
 * Response is always 200 even when no grocery list exists (has_list:false,
 * readiness:{}) so callers can safely display "no_list" without treating it
 * as an error.
 *
 * Auth: self-only reads.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { getPlan } from '@/lib/plans/planServerService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getGroceryItemsCoveringDate } from '@/lib/plans/groceryServerService';
import { computeReadinessMap } from '@/lib/plans/readinessUtils';
import type { MealReadinessResult } from '@/lib/plans/readinessUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const planId = req.query.planId;
  if (typeof planId !== 'string' || !planId) {
    return res.status(400).json({ error: 'planId is required' });
  }

  const date = req.query.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const plan = await getPlan(personId, planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    // Optional comma-separated meal IDs from the caller (day page) so we
    // can return no_list for meals that have no grocery contributions at all.
    const rawMealIds = typeof req.query.meal_ids === 'string' ? req.query.meal_ids : '';
    const callerMealIds = rawMealIds
      ? rawMealIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const loadHandledByMealId = async (mealIds: string[]) => {
      const uniqueMealIds = Array.from(new Set(mealIds));
      const handledByMealId = new Map<string, 'eaten' | 'skipped'>();
      if (uniqueMealIds.length === 0) return handledByMealId;

      const { data: mealRows, error: mealErr } = await supabaseAdmin
        .from('planned_meals')
        .select('id, execution_state')
        .eq('person_id', personId)
        .eq('plan_id', planId)
        .in('id', uniqueMealIds);
      if (mealErr) throw new Error(`Failed to load planned meal execution states: ${mealErr.message}`);
      for (const row of mealRows ?? []) {
        const state = (row as { id: string; execution_state: string | null }).execution_state;
        if (state === 'eaten' || state === 'skipped') {
          handledByMealId.set((row as { id: string }).id, state);
        }
      }
      return handledByMealId;
    };

    const markHandled = (
      readiness: Record<string, MealReadinessResult>,
      handledByMealId: Map<string, 'eaten' | 'skipped'>,
    ) => {
      for (const [mealId] of Array.from(handledByMealId.entries())) {
        readiness[mealId] = {
          state: 'handled',
          total: 0,
          covered: 0,
          has_unresolved: false,
        };
      }
      return readiness;
    };

    // Fetch grocery items for this plan + date (read-only; does not create).
    const existing = await getGroceryItemsCoveringDate(personId, planId, date);

    if (!existing) {
      // No grocery list for this date yet — return no_list for all caller meals.
      const handledByMealId = await loadHandledByMealId(callerMealIds);
      const readiness = markHandled(computeReadinessMap(callerMealIds, []), handledByMealId);
      return res.status(200).json({ has_list: false, list_context: null, readiness });
    }

    // Collect all meal IDs referenced by grocery items plus any extras from caller.
    const fromItems = existing.items.flatMap((it) => it.source_planned_meal_ids);
    const allMealIds = Array.from(
      new Set<string>([...fromItems, ...callerMealIds]),
    );
    const handledByMealId = await loadHandledByMealId(allMealIds);
    const readiness = markHandled(computeReadinessMap(allMealIds, existing.items), handledByMealId);

    return res.status(200).json({
      has_list: true,
      list_context: existing.context,
      readiness,
    });
  } catch (err) {
    console.error('[GET /api/journal/plans/:planId/readiness]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
