/**
 * PATCH /api/journal/plans/slots/:slotId
 *
 * Phase 3: edit day-level slot fields that the user owns per-day.
 * Currently supported: `target_time` and `slot_label`. The resolver
 * (scheduleResolver.ts) owns slot structure + program overrides;
 * this route is the escape hatch so a user can nudge a single day's
 * lunch from 12:30 to 13:00 without mutating the baseline schedule.
 *
 * Auth: self-only write. Ownership validated via person_id match.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { isValidHHmm } from '@/lib/plans/scheduleResolver';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const slotId = typeof req.query.slotId === 'string' ? req.query.slotId : null;
    if (!slotId) return res.status(400).json({ error: 'slotId is required' });

    const body = (req.body ?? {}) as {
      target_time?: unknown;
      slot_label?: unknown;
    };

    const updates: Record<string, unknown> = {};

    if (body.target_time !== undefined) {
      if (body.target_time === null) {
        updates.target_time = null;
      } else if (isValidHHmm(body.target_time)) {
        updates.target_time = body.target_time;
      } else {
        return res
          .status(400)
          .json({ error: 'target_time must be HH:mm (24h) or null' });
      }
    }

    if (body.slot_label !== undefined) {
      if (body.slot_label === null) {
        updates.slot_label = null;
      } else if (typeof body.slot_label === 'string') {
        const trimmed = body.slot_label.trim();
        updates.slot_label = trimmed.length > 0 ? trimmed : null;
      } else {
        return res.status(400).json({ error: 'slot_label must be a string or null' });
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No editable fields provided.' });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('plan_slots')
      .update(updates)
      .eq('id', slotId)
      .eq('person_id', personId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[API /journal/plans/slots PATCH] update error:', error);
      return res.status(500).json({ error: 'Failed to update slot.' });
    }
    if (!data) return res.status(404).json({ error: 'Slot not found.' });

    return res.status(200).json({ slot: data });
  } catch (err) {
    console.error('[API /journal/plans/slots PATCH] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
