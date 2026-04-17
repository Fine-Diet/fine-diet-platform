/**
 * POST /api/product-update/send
 *
 * Triggers a Product Update send to the full product-updates audience.
 *
 * Auth: Bearer <EDITORIAL_API_KEY>
 *
 * Body: same shape as the editorial send (campaignSlug, templateId, subject, …)
 *
 * Audience rule (enforced by view + per-contact re-check):
 *   - email_preferences.product_updates = true
 *   - email_preferences.unsubscribe_all_at IS NULL
 *   (no fine_print_sequence_completed or email_marketing subscription required)
 *
 * Process per contact:
 *   1. Generate signed unsubscribe URL
 *   2. Real-time compliance re-check
 *   3. Send via Resend using the supplied templateId
 *   4. Log product_update_sent event to people_events
 *   5. On send failure: log product_update_send_failed event to people_events
 *
 * Returns: { sent, skipped, errors[], campaignSlug, audienceSize }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { buildUnsubscribeUrl } from '@/lib/emailLinks';
import { renderCampaignEmail } from '@/lib/emailTemplates';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const campaignSchema = z.object({
  campaignSlug: z.string().min(1),
  templateId: z.string().min(1),
  subject: z.string().min(1),
  previewText: z.string().default(''),
  headline: z.string().min(1),
  body: z.string().min(1),
  ctaUrl: z.string().url(),
  ctaText: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AudienceContact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

async function isStillEligible(personId: string): Promise<boolean> {
  const { data: pref } = await supabaseAdmin
    .from('email_preferences')
    .select('person_id')
    .eq('person_id', personId)
    .eq('product_updates', true)
    .is('unsubscribe_all_at', null)
    .maybeSingle();

  return !!pref;
}

async function sendViaResend(
  resendKey: string,
  contact: AudienceContact,
  unsubscribeUrl: string,
  campaign: z.infer<typeof campaignSchema>,
): Promise<{ ok: boolean; resendId?: string; error?: string }> {
  const { html, text } = renderCampaignEmail('product_update_weekly', {
    firstName: contact.first_name || 'there',
    headline: campaign.headline,
    body: campaign.body,
    ctaUrl: campaign.ctaUrl,
    ctaText: campaign.ctaText,
    unsubscribeUrl,
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Fine Diet <hi@myfinediet.com>',
      reply_to: 'hi@myfinediet.com',
      to: contact.email,
      subject: campaign.subject,
      headers: campaign.previewText
        ? { 'X-Preview-Text': campaign.previewText }
        : undefined,
      html,
      text,
      tags: [{ name: 'campaign_slug', value: campaign.campaignSlug }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${errBody}` };
  }

  const json = await res.json();
  return { ok: true, resendId: json.id };
}

async function logProductUpdateSent(
  personId: string,
  campaignSlug: string,
  templateId: string,
  resendId: string | undefined,
): Promise<void> {
  await supabaseAdmin.from('people_events').insert({
    person_id: personId,
    event_type: 'product_update_sent',
    source: 'product_update_send_api',
    channel: 'email',
    metadata: {
      campaignSlug,
      templateId,
      resendId: resendId ?? null,
    },
    created_at: new Date().toISOString(),
  });
}

async function logProductUpdateSendFailed(
  personId: string,
  campaignSlug: string,
  templateId: string,
  error: string,
): Promise<void> {
  await supabaseAdmin.from('people_events').insert({
    person_id: personId,
    event_type: 'product_update_send_failed',
    source: 'product_update_send_api',
    channel: 'email',
    metadata: {
      campaignSlug,
      templateId,
      error,
    },
    created_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization');
  const expectedKey = process.env.EDITORIAL_API_KEY;
  if (!expectedKey) {
    return NextResponse.json({ error: 'EDITORIAL_API_KEY not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = campaignSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const campaign = parsed.data;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://myfinediet.com';

  // Fetch audience from view (eligibility enforced by view definition)
  const { data: audience, error: audienceError } = await supabaseAdmin
    .from('v_product_updates_audience')
    .select('id, email, first_name, last_name');

  if (audienceError) {
    return NextResponse.json(
      { error: `Audience query failed: ${audienceError.message}` },
      { status: 500 },
    );
  }

  if (!audience || audience.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: 0,
      errors: [],
      campaignSlug: campaign.campaignSlug,
      audienceSize: 0,
      message: 'No eligible contacts in audience.',
    });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const contact of audience as AudienceContact[]) {
    // Real-time compliance double-check (state may have changed since view query)
    const eligible = await isStillEligible(contact.id);
    if (!eligible) {
      skipped++;
      continue;
    }

    // Generate signed unsubscribe URL
    const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, contact.id, contact.email);

    // Send
    const sendResult = await sendViaResend(resendKey, contact, unsubscribeUrl, campaign);
    if (!sendResult.ok) {
      errors.push(`${contact.email}: ${sendResult.error}`);
      // Log failure to people_events so it's visible without digging into server logs
      try {
        await logProductUpdateSendFailed(
          contact.id,
          campaign.campaignSlug,
          campaign.templateId,
          sendResult.error ?? 'Unknown error',
        );
      } catch (logErr) {
        console.warn(`Failed to log product_update_send_failed for ${contact.id}:`, logErr);
      }
      continue;
    }

    // Log success event
    try {
      await logProductUpdateSent(
        contact.id,
        campaign.campaignSlug,
        campaign.templateId,
        sendResult.resendId,
      );
    } catch (logErr) {
      console.warn(`Failed to log product_update_sent for ${contact.id}:`, logErr);
    }

    sent++;
  }

  return NextResponse.json({
    sent,
    skipped,
    errors,
    campaignSlug: campaign.campaignSlug,
    audienceSize: audience.length,
  });
}
