/**
 * GET   /api/journal/goals — returns daily calorie and macro goals
 * PATCH /api/journal/goals — updates calorie and/or macro goals
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, resolveJournalTargetPerson, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import { getUserGoals, updateUserGoals } from '@/lib/journal/journalServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return;
      const goals = await getUserGoals(targetPersonId);
      return res.status(200).json({ goals });
    }

    if (req.method === 'PATCH') {
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;
      const body = req.body ?? {};

      const patch: Record<string, unknown> = {};
      if (typeof body.dailyCalorieGoal === 'number') patch.dailyCalorieGoal = body.dailyCalorieGoal;
      // Nutrition Targets v1 review "clear_existing_macros": explicit `null`
      // is an intentional clear signal (the user blanked all three macro
      // fields on purpose) and must be forwarded through, not dropped by a
      // truthy check — only omit macroGoals entirely when the field is
      // absent from the request body (i.e. this save doesn't concern macros
      // at all, such as a calorie-only "Looks Good" confirmation).
      if (body.macroGoals === null || (body.macroGoals && typeof body.macroGoals === 'object')) {
        patch.macroGoals = body.macroGoals;
      }
      // Nutrition Targets v1 — provenance describing how the calorie value was derived/confirmed.
      // Optional; callers that only adjust macros without re-deriving calories may omit it.
      if (body.provenance === null || (body.provenance && typeof body.provenance === 'object')) {
        patch.provenance = body.provenance;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No valid goal fields provided' });
      }

      const goals = await updateUserGoals(personId, patch as any);
      return res.status(200).json({ goals });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[API /api/journal/goals] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
