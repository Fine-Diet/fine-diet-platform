/**
 * POST /api/journal/plans/ai/recommend-menu-picks
 *
 * Packet 5: derives slot context from a plan_slot, generates a locked
 * best/better/fallback recommendation set from the referenced
 * imported_menu, and persists a `planned_eat_out_events` row bound to
 * the slot.
 *
 * Request body (RecommendMenuPicksRequestSchema):
 *   {
 *     imported_menu_id: string (uuid),
 *     slot_id: string (uuid),
 *     scheduled_at?: string | null,
 *   }
 *
 * Response:
 *   { eat_out_event: PlannedEatOutEvent, ai_run_id: string }
 *
 * Auth: self-only write.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { RecommendMenuPicksRequestSchema } from '@/lib/plans/validators';
import { generateEatOutRecommendations } from '@/lib/plans/eatOutRecommender';
import {
  createPlannedEatOutEvent,
  getImportedMenu,
} from '@/lib/plans/eatOutServerService';
import type {
  EatOutRecommendationSlotContext,
  ImportedMenuPayload,
} from '@/lib/plans/types';

/**
 * Derive a meal_type_hint for a plan_slot. Preference order:
 *   1. target_time HH:mm heuristic (honors Packet 3 slot timing)
 *   2. slot_block (morning / midday / evening)
 *   3. default: 'dinner' (most common eat-out occasion)
 */
function deriveMealTypeHint(
  slot_block: string | null,
  target_time: string | null,
): EatOutRecommendationSlotContext['meal_type_hint'] {
  if (target_time) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(target_time);
    if (m) {
      const minutes = Number(m[1]) * 60 + Number(m[2]);
      if (minutes < 10 * 60 + 30) return 'breakfast';
      if (minutes < 15 * 60) return 'lunch';
      if (minutes < 22 * 60) return 'dinner';
      return 'snack';
    }
  }
  if (slot_block === 'morning') return 'breakfast';
  if (slot_block === 'midday') return 'lunch';
  if (slot_block === 'evening') return 'dinner';
  return 'dinner';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const parsed = RecommendMenuPicksRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }
    const body = parsed.data;

    const importedMenu = await getImportedMenu(personId, body.imported_menu_id);
    if (!importedMenu) {
      return res.status(404).json({ error: 'Imported menu not found.' });
    }

    // Load slot + its parent plan_day so we can stamp plan_day_id and
    // build the slot_context for the recommender.
    const { data: slotRow, error: slotErr } = await supabaseAdmin
      .from('plan_slots')
      .select('id, plan_day_id, person_id, slot_block, slot_ordinal, target_time')
      .eq('id', body.slot_id)
      .eq('person_id', personId)
      .maybeSingle();
    if (slotErr) throw new Error(`Failed to load plan_slot: ${slotErr.message}`);
    if (!slotRow) return res.status(404).json({ error: 'Plan slot not found.' });

    const slot = slotRow as {
      id: string;
      plan_day_id: string;
      person_id: string;
      slot_block: string | null;
      slot_ordinal: number;
      target_time: string | null;
    };

    const { data: dayRow, error: dayErr } = await supabaseAdmin
      .from('plan_days')
      .select('id, plan_id, date_local')
      .eq('id', slot.plan_day_id)
      .eq('person_id', personId)
      .maybeSingle();
    if (dayErr) throw new Error(`Failed to load plan_day: ${dayErr.message}`);
    if (!dayRow) return res.status(404).json({ error: 'Plan day not found.' });
    const day = dayRow as { id: string; plan_id: string; date_local: string };

    const startedAt = Date.now();

    const { data: runRow, error: runErr } = await supabaseAdmin
      .from('ai_runs')
      .insert({
        person_id: personId,
        plan_id: day.plan_id,
        run_type: 'restaurant_rec',
        provider: process.env.PLANS_AI_PROVIDER ?? 'stub',
        request_payload_json: {
          imported_menu_id: body.imported_menu_id,
          slot_id: body.slot_id,
          scheduled_at: body.scheduled_at ?? null,
        },
        status: 'pending',
        nds_version: NDS_VERSION,
        classifier_version: CLASSIFIER_VERSION,
      })
      .select('id')
      .single();
    if (runErr) throw new Error(`Failed to create ai_run: ${runErr.message}`);
    const aiRunId = (runRow as { id: string }).id;

    try {
      const slot_context: EatOutRecommendationSlotContext = {
        slot_id: slot.id,
        plan_date: day.date_local,
        target_time: slot.target_time,
        meal_type_hint: deriveMealTypeHint(slot.slot_block, slot.target_time),
      };

      const menuPayload: ImportedMenuPayload =
        importedMenu.parsed_payload_json ?? { sections: [] };

      const recommendation = generateEatOutRecommendations({
        restaurant_name: importedMenu.restaurant_name,
        menu: menuPayload,
        slot_context,
      });

      const event = await createPlannedEatOutEvent({
        personId,
        plan_day_id: day.id,
        plan_slot_id: slot.id,
        venue_name: importedMenu.restaurant_name,
        venue_type: 'restaurant',
        scheduled_at: body.scheduled_at ?? null,
        menu_url: importedMenu.source_url,
        imported_menu_id: importedMenu.id,
        recommendation_payload_json: recommendation,
      });

      await supabaseAdmin
        .from('ai_runs')
        .update({
          status: 'succeeded',
          response_payload_json: {
            eat_out_event_id: event.id,
            imported_menu_id: importedMenu.id,
            best_option: recommendation.best?.option_name ?? null,
            better_option: recommendation.better?.option_name ?? null,
            fallback_option: recommendation.fallback?.option_name ?? null,
          },
          latency_ms: Date.now() - startedAt,
        })
        .eq('id', aiRunId);

      return res.status(201).json({ eat_out_event: event, ai_run_id: aiRunId });
    } catch (recErr) {
      await supabaseAdmin
        .from('ai_runs')
        .update({
          status: 'failed',
          error_text:
            recErr instanceof Error ? recErr.message : 'Unknown recommendation failure.',
          latency_ms: Date.now() - startedAt,
        })
        .eq('id', aiRunId);
      throw recErr;
    }
  } catch (err) {
    console.error('[API /journal/plans/ai/recommend-menu-picks POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
