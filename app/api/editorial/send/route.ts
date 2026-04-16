/**
 * POST /api/editorial/send
 *
 * Triggers a Fine Print editorial (weekly) send to the post-nurture eligible audience.
 *
 * Auth: Bearer <EDITORIAL_API_KEY>
 *
 * Body: EditorialCampaign (from lib/config/editorialSends.ts)
 *
 * Process per contact:
 *   1. Generate signed unsubscribe URL
 *   2. Real-time compliance check (unsubscribe_all_at IS NULL + email_marketing active)
 *   3. Send via Resend using the "Fine Print — Weekly" template
 *   4. Log fine_print_editorial_sent event to people_events
 *
 * Returns: { sent, skipped, errors[], campaignSlug }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { buildUnsubscribeUrl } from '@/lib/emailLinks';

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
  // Check email_preferences: not globally unsubscribed + nutrition_insights on
  const { data: pref } = await supabaseAdmin
    .from('email_preferences')
    .select('person_id')
    .eq('person_id', personId)
    .is('unsubscribe_all_at', null)
    .eq('nutrition_insights', true)
    .maybeSingle();

  if (!pref) return false;

  // Check subscription still active
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('person_id', personId)
    .eq('subscription_type', 'email_marketing')
    .eq('is_active', true)
    .maybeSingle();

  return !!sub;
}

async function sendViaResend(
  resendKey: string,
  contact: AudienceContact,
  unsubscribeUrl: string,
  campaign: z.infer<typeof campaignSchema>,
): Promise<{ ok: boolean; resendId?: string; error?: string }> {
  const firstName = contact.first_name || 'there';

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
      template_id: campaign.templateId,
      params: {
        FIRST_NAME: firstName,
        HEADLINE: campaign.headline,
        BODY: campaign.body,
        CTA_URL: campaign.ctaUrl,
        CTA_TEXT: campaign.ctaText,
        UNSUBSCRIBE_URL: unsubscribeUrl,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${text}` };
  }

  const json = await res.json();
  return { ok: true, resendId: json.id };
}

async function logEditorialSent(
  personId: string,
  campaignSlug: string,
  templateId: string,
  resendId: string | undefined,
): Promise<void> {
  await supabaseAdmin.from('people_events').insert({
    person_id: personId,
    event_type: 'fine_print_editorial_sent',
    source: 'editorial_send_api',
    channel: 'email',
    metadata: {
      campaignSlug,
      templateId,
      resendId: resendId ?? null,
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

  // Fetch audience from view (all 4 eligibility conditions enforced by view)
  const { data: audience, error: audienceError } = await supabaseAdmin
    .from('v_fine_print_editorial_audience')
    .select('id, email, first_name, last_name');

  if (audienceError) {
    return NextResponse.json({ error: `Audience query failed: ${audienceError.message}` }, { status: 500 });
  }

  if (!audience || audience.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: 0,
      errors: [],
      campaignSlug: campaign.campaignSlug,
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
      continue;
    }

    // Log event
    try {
      await logEditorialSent(contact.id, campaign.campaignSlug, campaign.templateId, sendResult.resendId);
    } catch (logErr) {
      // Don't fail the send over a logging error
      console.warn(`Failed to log editorial_sent for ${contact.id}:`, logErr);
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
