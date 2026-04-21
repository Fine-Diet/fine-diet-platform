/**
 * GET/PATCH /api/journal/plans/eat-out/[id]
 *
 * Packet 5: event detail fetch + lightweight patch. GET returns the
 * eat-out event together with its source imported_menu (for the review
 * UI) and the currently-attached planned_meal (if the user already
 * selected an option). PATCH allows restaurant-name, scheduled_at,
 * venue_type, menu_url, and manual edits to the recommendation payload.
 *
 * Auth: self-only read/write.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { EatOutEventPatchSchema } from '@/lib/plans/validators';
import {
  getImportedMenu,
  getPlannedEatOutEvent,
  getSelectedPlannedMealForEvent,
  updatePlannedEatOutEvent,
} from '@/lib/plans/eatOutServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing event id.' });

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    if (req.method === 'GET') {
      const event = await getPlannedEatOutEvent(personId, id);
      if (!event) return res.status(404).json({ error: 'Eat-out event not found.' });

      const [imported_menu, planned_meal] = await Promise.all([
        event.imported_menu_id
          ? getImportedMenu(personId, event.imported_menu_id)
          : Promise.resolve(null),
        getSelectedPlannedMealForEvent(personId, event),
      ]);

      return res.status(200).json({
        eat_out_event: event,
        imported_menu,
        planned_meal,
      });
    }

    if (req.method === 'PATCH') {
      const parsed = EatOutEventPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
      }
      const updated = await updatePlannedEatOutEvent(personId, id, parsed.data);
      if (!updated) return res.status(404).json({ error: 'Eat-out event not found.' });
      return res.status(200).json({ eat_out_event: updated });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans/eat-out/[id]] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
