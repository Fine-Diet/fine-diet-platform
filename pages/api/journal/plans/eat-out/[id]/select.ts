/**
 * POST /api/journal/plans/eat-out/[id]/select
 *
 * Packet 5: accept one of the recommended options (`best`, `better`,
 * `fallback`) and attach it into the linked plan slot as a
 * `planned_meal`. Preserves the eat-out event so the recommendation
 * context remains reviewable.
 *
 * Request body (EatOutSelectRequestSchema):
 *   {
 *     option_label: 'best' | 'better' | 'fallback',
 *     meal_name_override?: string | null,
 *   }
 *
 * Response:
 *   { eat_out_event: PlannedEatOutEvent, planned_meal: PlannedMeal }
 *
 * Auth: self-only write.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { EatOutSelectRequestSchema } from '@/lib/plans/validators';
import {
  getPlannedEatOutEvent,
  selectEatOutOption,
} from '@/lib/plans/eatOutServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing event id.' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const parsed = EatOutSelectRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }

    const event = await getPlannedEatOutEvent(personId, id);
    if (!event) return res.status(404).json({ error: 'Eat-out event not found.' });
    if (!event.plan_slot_id) {
      return res
        .status(400)
        .json({ error: 'Event is not bound to a plan slot; cannot attach meal.' });
    }

    // Resolve plan_id from the plan_day row.
    const { data: dayRow, error: dayErr } = await supabaseAdmin
      .from('plan_days')
      .select('id, plan_id')
      .eq('id', event.plan_day_id)
      .eq('person_id', personId)
      .maybeSingle();
    if (dayErr) throw new Error(`Failed to load plan_day: ${dayErr.message}`);
    if (!dayRow) return res.status(404).json({ error: 'Plan day not found.' });
    const day = dayRow as { id: string; plan_id: string };

    const result = await selectEatOutOption({
      personId,
      planId: day.plan_id,
      planDayId: day.id,
      planSlotId: event.plan_slot_id,
      eventId: event.id,
      option_label: parsed.data.option_label,
      meal_name_override: parsed.data.meal_name_override ?? null,
    });

    return res.status(200).json({
      eat_out_event: result.event,
      planned_meal: result.planned_meal,
    });
  } catch (err) {
    console.error('[API /journal/plans/eat-out/[id]/select POST] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}
