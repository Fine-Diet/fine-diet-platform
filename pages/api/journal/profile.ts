/**
 * GET  /api/journal/profile — returns profile fields from people columns + metadata
 * POST /api/journal/profile — partial update of profile fields
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

const COLUMN_FIELDS = ['first_name', 'last_name', 'email_marketing_opt_in', 'sms_marketing_opt_in'] as const;

const METADATA_FIELDS = [
  'date_of_birth',
  'sex',
  'primary_goal',
  'dietary_style',
  'eating_window',
  'eating_window_start',
  'eating_window_end',
  'allergies',
  'symptom_priorities',
  'activity_baseline',
  'sleep_schedule',
  'cycle_details',
  'notifications',
  'onboarding_started_at',
  'onboarding_completed_at',
  // Plans Phase 1 — body state and planning preferences.
  // Age is always derived from date_of_birth; never stored directly.
  // weight_kg is a cache of the most recent body_measurements entry.
  'height_cm',
  'height_display_unit',
  'weight_kg',
  'weight_display_unit',
  'weight_as_of',
  'dining_out_frequency',
  'shopping_mode_preference',
  'household_size',
  // Plans Phase 3 — baseline meal schedule template owned by Profile.
  // Shape enforced by MealScheduleSchema in lib/plans/validators.ts.
  'meal_schedule',
  // Packet D — pre-app onboarding. Single structured blob for answers that do
  // not have a dedicated canonical metadata field (intent, planning prefs,
  // constraints). Canonical fields above (date_of_birth, sex, height_cm,
  // weight_kg, primary_goal, dietary_style, allergies, eating_window*,
  // dining_out_frequency, shopping_mode_preference, household_size,
  // meal_schedule) are still written directly so the rest of the app benefits.
  'onboarding',
] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;
  if (!(await requireCallerJournalAccess(res, ctx))) return;

  const { personId } = ctx;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('people')
        .select('first_name, last_name, email_marketing_opt_in, sms_marketing_opt_in, metadata')
        .eq('id', personId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Person not found' });
      }

      const md = (data.metadata ?? {}) as Record<string, unknown>;

      const profile: Record<string, unknown> = {
        first_name: data.first_name,
        last_name: data.last_name,
        email_marketing_opt_in: data.email_marketing_opt_in,
        sms_marketing_opt_in: data.sms_marketing_opt_in,
      };

      for (const key of METADATA_FIELDS) {
        if (md[key] !== undefined) profile[key] = md[key];
      }

      return res.status(200).json({ profile });
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};

      const { data: current, error: fetchErr } = await supabaseAdmin
        .from('people')
        .select('metadata')
        .eq('id', personId)
        .single();

      if (fetchErr || !current) {
        return res.status(500).json({ error: 'Failed to read current profile' });
      }

      const currentMeta = (current.metadata ?? {}) as Record<string, unknown>;
      const columnUpdates: Record<string, unknown> = {};
      const metaUpdates: Record<string, unknown> = {};

      for (const key of COLUMN_FIELDS) {
        if (body[key] !== undefined) columnUpdates[key] = body[key];
      }

      for (const key of METADATA_FIELDS) {
        if (body[key] !== undefined) metaUpdates[key] = body[key];
      }

      const updatedMeta = { ...currentMeta, ...metaUpdates };

      const { error: updateErr } = await supabaseAdmin
        .from('people')
        .update({ ...columnUpdates, metadata: updatedMeta, updated_at: new Date().toISOString() })
        .eq('id', personId);

      if (updateErr) {
        console.error('[API /journal/profile] Update error:', updateErr);
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[API /journal/profile] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
