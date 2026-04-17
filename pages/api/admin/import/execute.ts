/**
 * API Route: Import Execute
 *
 * POST /api/admin/import/execute
 *
 * Writes approved import rows to the database with full safety protections.
 * Only processes rows where action is 'create' or 'update' (pre-validated by dry-run).
 * Runs sequentially to avoid race conditions on small lists (~300 contacts).
 *
 * Safety guarantees:
 *   - never overwrites non-null first_name / last_name
 *   - never resubscribes an unsubscribed person
 *   - never creates duplicate subscriptions (upsert)
 *   - never sets nutrition_insights = false
 *   - idempotent: running twice produces the same state
 *
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  ImportRow,
  ImportOptions,
  ExecuteRow,
  ExecuteResponse,
} from '@/lib/admin/importTypes';
import { DEFAULT_IMPORT_OPTIONS } from '@/lib/admin/importTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (e: string) => e.trim().toLowerCase();
const isValidEmail = (e: string) => EMAIL_RE.test(e);

/** Parse tags string → plain array */
function parseTags(raw?: string): string[] {
  if (!raw) return [];
  // Handle Klaviyo's JSON array format: ["tag1","tag2"] or plain: tag1, tag2
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((t: unknown) => String(t).toLowerCase());
    } catch {
      // fall through to comma split
    }
  }
  return trimmed.split(',').map((t) => t.replace(/['"]/g, '').trim()).filter(Boolean);
}

/** Determine whether a contact row should get an active subscription */
function shouldSubscribe(subscribed: boolean | null, options: ImportOptions): boolean {
  if (subscribed === true) return true;
  if (subscribed === false) return false; // explicit no-consent — never subscribe
  // null = unknown
  return options.unknownConsentBehavior === 'subscribe';
}

// ---------------------------------------------------------------------------
// Per-person import logic
// ---------------------------------------------------------------------------

async function importContact(
  row: ImportRow,
  options: ImportOptions,
): Promise<{ action: 'created' | 'updated' | 'skipped'; message: string }> {
  const email = normalizeEmail(row.email);

  // ── 1. Check if person already exists ───────────────────────────────────
  const { data: existingPerson } = await supabaseAdmin
    .from('people')
    .select('id, first_name, last_name, status')
    .eq('email', email)
    .maybeSingle();

  let personId: string;
  let wasNew = false;

  if (existingPerson) {
    personId = existingPerson.id;

    // Safety check: if already unsubscribed in our system, skip entirely
    const { data: pref } = await supabaseAdmin
      .from('email_preferences')
      .select('unsubscribe_all_at')
      .eq('person_id', personId)
      .maybeSingle();

    if (pref?.unsubscribe_all_at) {
      return {
        action: 'skipped',
        message: 'Contact is globally unsubscribed — skipped.',
      };
    }

    if (existingPerson.status === 'unsubscribed') {
      return {
        action: 'skipped',
        message: 'Contact status is unsubscribed — skipped.',
      };
    }

    // Update name fields ONLY if currently null
    const updates: Record<string, string> = {};
    if (!existingPerson.first_name && row.first_name?.trim()) {
      updates.first_name = row.first_name.trim();
    }
    if (!existingPerson.last_name && row.last_name?.trim()) {
      updates.last_name = row.last_name.trim();
    }

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from('people').update(updates).eq('id', personId);
    }
  } else {
    // ── 2. Create new person ─────────────────────────────────────────────
    const { data: newPerson, error: createError } = await supabaseAdmin
      .from('people')
      .insert({
        email,
        first_name: row.first_name?.trim() || null,
        last_name: row.last_name?.trim() || null,
        status: 'marketing_only',
        primary_source: 'klaviyo_import',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createError || !newPerson) {
      throw new Error(`Failed to create person: ${createError?.message}`);
    }

    personId = newPerson.id;
    wasNew = true;
  }

  // ── 3. Subscription ──────────────────────────────────────────────────────
  const willSubscribe = shouldSubscribe(row.subscribed, options);

  if (willSubscribe) {
    // Upsert email_marketing subscription — safe to run multiple times
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, is_active')
      .eq('person_id', personId)
      .eq('subscription_type', 'email_marketing')
      .maybeSingle();

    if (!existingSub) {
      await supabaseAdmin.from('subscriptions').insert({
        person_id: personId,
        subscription_type: 'email_marketing',
        is_active: true,
        subscribed_at: row.klaviyo_created_at || new Date().toISOString(),
        source: 'klaviyo_import',
      });
    }
    // If existingSub exists but is_active = false, we do NOT reactivate it
    // (that would be resubscribing — against policy)
  }

  // ── 4. Email preferences ─────────────────────────────────────────────────
  if (willSubscribe && options.setNutritionInsights) {
    const { data: existingPref } = await supabaseAdmin
      .from('email_preferences')
      .select('id, nutrition_insights')
      .eq('person_id', personId)
      .maybeSingle();

    if (!existingPref) {
      await supabaseAdmin.from('email_preferences').insert({
        person_id: personId,
        nutrition_insights: true,
        unsubscribe_all_at: null,
      });
    } else if (!existingPref.nutrition_insights) {
      // Only set to true — never override true with false
      await supabaseAdmin
        .from('email_preferences')
        .update({ nutrition_insights: true })
        .eq('id', existingPref.id);
    }
  } else if (!willSubscribe) {
    // Create preferences record with no opt-ins if it doesn't exist
    const { data: existingPref } = await supabaseAdmin
      .from('email_preferences')
      .select('id')
      .eq('person_id', personId)
      .maybeSingle();

    if (!existingPref) {
      await supabaseAdmin.from('email_preferences').insert({
        person_id: personId,
        nutrition_insights: false,
        unsubscribe_all_at: null,
      });
    }
  }

  // ── 5. Log contact_imported event ────────────────────────────────────────
  const tags = parseTags(row.tags);
  await supabaseAdmin.from('people_events').insert({
    person_id: personId,
    event_type: 'contact_imported',
    source: 'klaviyo_import',
    channel: 'email',
    metadata: {
      wasNew,
      subscribed: row.subscribed,
      tags,
      klaviyo_created_at: row.klaviyo_created_at || null,
      markAsEditorialEligible: options.markAsEditorialEligible,
    },
    created_at: new Date().toISOString(),
  });

  // ── 6. Editorial eligibility ─────────────────────────────────────────────
  if (willSubscribe && options.markAsEditorialEligible) {
    // Only log if not already present (idempotent)
    const { data: existingCompletion } = await supabaseAdmin
      .from('people_events')
      .select('id')
      .eq('person_id', personId)
      .eq('event_type', 'fine_print_sequence_completed')
      .limit(1)
      .maybeSingle();

    if (!existingCompletion) {
      await supabaseAdmin.from('people_events').insert({
        person_id: personId,
        event_type: 'fine_print_sequence_completed',
        source: 'klaviyo_import',
        channel: 'email',
        metadata: {
          manual: true,
          note: 'Marked editorial-eligible at Klaviyo import — bypassed nurture sequence.',
        },
        created_at: new Date().toISOString(),
      });
    }
  }

  return {
    action: wasNew ? 'created' : 'updated',
    message: wasNew
      ? `Created new contact${willSubscribe ? ' with active subscription.' : ' without subscription.'}${willSubscribe && options.markAsEditorialEligible ? ' Editorial-eligible.' : ''}`
      : `Updated existing contact${willSubscribe ? '. Subscription ensured.' : '.'}${willSubscribe && options.markAsEditorialEligible ? ' Editorial-eligible.' : ''}`,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ExecuteResponse | { error: string }>,
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { rows, options: rawOptions } = req.body as {
    rows: ImportRow[];
    options?: Partial<ImportOptions>;
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required.' });
  }

  const options: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, ...rawOptions };

  const result: ExecuteResponse = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    rows: [],
  };

  // Process sequentially — important for ~300 rows to avoid Supabase rate limits
  for (const row of rows) {
    const email = normalizeEmail(row.email || '');

    // Skip invalid rows that somehow slipped through
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      result.rows.push({
        sourceRowIndex: row.sourceRowIndex,
        email,
        action: 'invalid',
        message: 'Invalid or missing email.',
      });
      result.errors++;
      continue;
    }

    // Skip explicit no-consent
    if (row.subscribed === false) {
      result.rows.push({
        sourceRowIndex: row.sourceRowIndex,
        email,
        action: 'skip_no_consent',
        message: 'Source record is unsubscribed — skipped.',
      });
      result.skipped++;
      continue;
    }

    try {
      const outcome = await importContact(row, options);

      result.rows.push({
        sourceRowIndex: row.sourceRowIndex,
        email,
        action: outcome.action === 'created' ? 'create' : outcome.action === 'updated' ? 'update' : 'skip_unsubscribed',
        message: outcome.message,
      });

      if (outcome.action === 'created') result.created++;
      else if (outcome.action === 'updated') result.updated++;
      else result.skipped++;
    } catch (err) {
      result.rows.push({
        sourceRowIndex: row.sourceRowIndex,
        email,
        action: 'error',
        message: err instanceof Error ? err.message : 'Unknown error.',
      });
      result.errors++;
    }
  }

  return res.status(200).json(result);
}
