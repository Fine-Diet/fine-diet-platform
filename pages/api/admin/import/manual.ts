/**
 * API Route: Manual Contact Add
 *
 * POST /api/admin/import/manual
 *
 * Adds or updates a single contact with full preference control.
 * Designed for operator use: testing, seeding, manual contact management.
 *
 * Safety rules (same as bulk import):
 *   - Upserts by email — never creates duplicates
 *   - Never overwrites non-null first_name / last_name
 *   - Never resubscribes an unsubscribed contact without explicit flag
 *   - Never downgrades preferences (only enables, never disables)
 *   - Always idempotent
 *
 * triggerNurtureNow vs markAsEditorialEligible:
 *   - These two options are mutually exclusive.
 *   - triggerNurtureNow → emits fine_print_signup webhook → n8n sends Welcome Email 1.
 *   - markAsEditorialEligible → immediately logs fine_print_sequence_completed, bypassing the
 *     nurture sequence entirely. Use for contacts known to already be warm.
 *   - Combining both would create contradictory sequence state, so the API rejects both = true.
 *
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { emitN8nWebhook } from '@/lib/peopleService';
import { buildUnsubscribeUrl } from '@/lib/emailLinks';

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface ManualContactInput {
  email: string;
  first_name?: string;
  last_name?: string;
  /** Stored as people.primary_source if person is new, or in event metadata */
  source?: string;
  /** Create/ensure active email_marketing subscription */
  emailMarketing: boolean;
  /** Set nutrition_insights = true in email_preferences */
  nutritionInsights: boolean;
  /** Set product_updates = true (if the column exists; gracefully ignored if not) */
  productUpdates: boolean;
  /** Set program_offers = true */
  programOffers: boolean;
  /** Set early_access = true */
  earlyAccess: boolean;
  /**
   * Log fine_print_sequence_completed so the contact is immediately
   * eligible for editorial sends. Only set if you are certain they
   * should bypass the nurture sequence.
   *
   * Mutually exclusive with triggerNurtureNow.
   */
  markAsEditorialEligible: boolean;
  /**
   * Emit a fine_print_signup webhook to n8n, triggering the live nurture
   * sequence (Welcome Email 1 → 2-day wait → Email 2 → 2-day wait → Email 3).
   *
   * Mutually exclusive with markAsEditorialEligible.
   */
  triggerNurtureNow: boolean;
}

export interface ManualContactResult {
  personId: string;
  wasNew: boolean;
  subscriptionCreated: boolean;
  editorialEligibilityLogged: boolean;
  nurtureTriggered: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ManualContactResult | { error: string }>,
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const input = req.body as ManualContactInput;

  // ── Validate ─────────────────────────────────────────────────────────────
  const email = (input.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  if (input.triggerNurtureNow && input.markAsEditorialEligible) {
    return res.status(400).json({
      error:
        '"Trigger nurture now" and "Mark as editorial-eligible now" are mutually exclusive. ' +
        'Nurture starts the 3-email sequence; editorial eligibility marks it as already complete. ' +
        'Choose one.',
    });
  }

  const source = (input.source || 'manual_admin').trim() || 'manual_admin';

  // ── 1. Upsert person ─────────────────────────────────────────────────────
  const { data: existingPerson } = await supabaseAdmin
    .from('people')
    .select('id, first_name, last_name, status')
    .eq('email', email)
    .maybeSingle();

  let personId: string;
  let wasNew = false;

  if (existingPerson) {
    personId = existingPerson.id;

    // Only update name fields if currently null
    const nameUpdates: Record<string, string> = {};
    if (!existingPerson.first_name && input.first_name?.trim()) {
      nameUpdates.first_name = input.first_name.trim();
    }
    if (!existingPerson.last_name && input.last_name?.trim()) {
      nameUpdates.last_name = input.last_name.trim();
    }
    if (Object.keys(nameUpdates).length > 0) {
      await supabaseAdmin.from('people').update(nameUpdates).eq('id', personId);
    }
  } else {
    const { data: newPerson, error: createErr } = await supabaseAdmin
      .from('people')
      .insert({
        email,
        first_name: input.first_name?.trim() || null,
        last_name: input.last_name?.trim() || null,
        status: 'marketing_only',
        primary_source: source,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createErr || !newPerson) {
      return res.status(500).json({ error: `Failed to create person: ${createErr?.message}` });
    }

    personId = newPerson.id;
    wasNew = true;
  }

  // ── 2. Check if already globally unsubscribed ────────────────────────────
  const { data: prefCheck } = await supabaseAdmin
    .from('email_preferences')
    .select('id, unsubscribe_all_at, nutrition_insights, product_updates, program_offers, early_access')
    .eq('person_id', personId)
    .maybeSingle();

  const alreadyGloballyUnsubscribed = !!prefCheck?.unsubscribe_all_at;

  // ── 3. Email marketing subscription ──────────────────────────────────────
  let subscriptionCreated = false;

  if (input.emailMarketing && !alreadyGloballyUnsubscribed) {
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
        subscribed_at: new Date().toISOString(),
        source,
      });
      subscriptionCreated = true;
    }
    // If existingSub exists with is_active = false → do NOT reactivate (unsubscribed user)
  }

  // ── 4. Email preferences (only enable, never disable) ────────────────────
  const prefUpsert: Record<string, unknown> = { person_id: personId };
  let shouldUpdatePrefs = false;

  // Compute what to set, only upgrading (true > false, never downgrading)
  if (input.nutritionInsights && !prefCheck?.nutrition_insights) {
    prefUpsert.nutrition_insights = true;
    shouldUpdatePrefs = true;
  }
  if (input.productUpdates && !(prefCheck as Record<string, unknown>)?.product_updates) {
    prefUpsert.product_updates = true;
    shouldUpdatePrefs = true;
  }
  if (input.programOffers && !(prefCheck as Record<string, unknown>)?.program_offers) {
    prefUpsert.program_offers = true;
    shouldUpdatePrefs = true;
  }
  if (input.earlyAccess && !(prefCheck as Record<string, unknown>)?.early_access) {
    prefUpsert.early_access = true;
    shouldUpdatePrefs = true;
  }

  if (!prefCheck) {
    // Create new preferences row
    await supabaseAdmin.from('email_preferences').insert({
      person_id: personId,
      nutrition_insights: input.nutritionInsights,
      unsubscribe_all_at: null,
      ...(input.productUpdates ? { product_updates: true } : {}),
      ...(input.programOffers ? { program_offers: true } : {}),
      ...(input.earlyAccess ? { early_access: true } : {}),
    });
  } else if (shouldUpdatePrefs) {
    await supabaseAdmin
      .from('email_preferences')
      .update(prefUpsert)
      .eq('person_id', personId);
  }

  // ── 5. Log contact_imported event ─────────────────────────────────────────
  await supabaseAdmin.from('people_events').insert({
    person_id: personId,
    event_type: 'contact_imported',
    source,
    channel: 'email',
    metadata: {
      wasNew,
      addedBy: 'manual_admin',
      emailMarketing: input.emailMarketing,
      nutritionInsights: input.nutritionInsights,
      markAsEditorialEligible: input.markAsEditorialEligible,
    },
    created_at: new Date().toISOString(),
  });

  // ── 6. Editorial eligibility ──────────────────────────────────────────────
  let editorialEligibilityLogged = false;

  if (input.markAsEditorialEligible) {
    // Check if fine_print_sequence_completed already exists for this person
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
        source,
        channel: 'email',
        metadata: {
          manual: true,
          note: 'Marked editorial-eligible by admin — bypassed nurture sequence.',
        },
        created_at: new Date().toISOString(),
      });
      editorialEligibilityLogged = true;
    }
  }

  // ── 7. Trigger Fine Print nurture sequence ────────────────────────────────
  let nurtureTriggered = false;

  if (input.triggerNurtureNow && !alreadyGloballyUnsubscribed) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://myfinediet.com';
    const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, personId, email);

    // Fetch latest person data for the webhook payload
    const { data: latestPerson } = await supabaseAdmin
      .from('people')
      .select('first_name, last_name, status')
      .eq('id', personId)
      .single();

    await emitN8nWebhook({
      kind: 'fine_print_signup',
      person: {
        id: personId,
        email,
        firstName: latestPerson?.first_name ?? null,
        lastName: latestPerson?.last_name ?? null,
        status: latestPerson?.status ?? 'marketing_only',
        unsubscribeUrl,
      },
      subscriptions: [{ subscription_type: 'email_marketing', program_slug: null, is_active: true }],
      preferences: {
        productUpdates: false,
        nutritionInsights: true,
        programOffers: true,
        earlyAccess: true,
      },
      event: {
        event_type: 'fine_print_signup',
        source,
        metadata: { intent: null, triggeredBy: 'manual_admin' },
      },
      context: {
        source_path: null,
        redirect_path: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
      },
    });

    // Log that the nurture was triggered from the admin tool
    await supabaseAdmin.from('people_events').insert({
      person_id: personId,
      event_type: 'fine_print_signup',
      source,
      channel: 'email',
      metadata: { triggeredBy: 'manual_admin', nurtureTriggered: true },
      created_at: new Date().toISOString(),
    });

    nurtureTriggered = true;
  }

  // ── 8. Response ───────────────────────────────────────────────────────────
  const parts: string[] = [];
  if (wasNew) parts.push('Contact created.');
  else parts.push('Existing contact updated.');
  if (subscriptionCreated) parts.push('Email marketing subscription activated.');
  if (editorialEligibilityLogged) parts.push('Marked as editorial-eligible (fine_print_sequence_completed logged).');
  if (nurtureTriggered) parts.push('Fine Print nurture sequence triggered — Welcome Email 1 will arrive shortly.');
  if (alreadyGloballyUnsubscribed) parts.push('Note: contact is globally unsubscribed — subscription and nurture were not modified.');

  return res.status(200).json({
    personId,
    wasNew,
    subscriptionCreated,
    editorialEligibilityLogged,
    nurtureTriggered,
    message: parts.join(' '),
  });
}
