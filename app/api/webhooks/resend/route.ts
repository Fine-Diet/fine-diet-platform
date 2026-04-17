/**
 * POST /api/webhooks/resend
 *
 * Ingests delivery/engagement events from Resend.
 * Verifies webhook authenticity via Svix signature before processing.
 *
 * Supported event types:
 *   email.delivered, email.opened, email.clicked, email.bounced,
 *   email.complained, email.delivery_delayed, email.failed, email.suppressed
 *
 * Attribution:
 *   - campaign_slug recovered from email tag "campaign_slug" embedded at send time
 *   - person_id resolved by looking up email in the people table
 *
 * Dedup: ON CONFLICT DO NOTHING on the unique indexes in email_events ensures
 * retried webhooks are safe to replay.
 *
 * Required env var: RESEND_WEBHOOK_SECRET  (whsec_… from Resend dashboard)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

// ---------------------------------------------------------------------------
// Types (Resend webhook payload shapes)
// ---------------------------------------------------------------------------

interface ResendEmailData {
  email_id: string;
  from: string;
  to: string[];
  subject?: string;
  created_at: string;
  tags?: Record<string, string>;
  click?: { link: string; user_agent?: string; ipAddress?: string };
  bounce?: { message?: string };
}

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: ResendEmailData;
}

// Map Resend event type strings to our DB event_type values
const EVENT_TYPE_MAP: Record<string, string> = {
  'email.delivered':        'delivered',
  'email.opened':           'opened',
  'email.clicked':          'clicked',
  'email.bounced':          'bounced',
  'email.complained':       'complained',
  'email.delivery_delayed': 'delivery_delayed',
  'email.failed':           'failed',
  'email.suppressed':       'suppressed',
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read raw body — required for signature verification
  const rawBody = await request.text();

  // Verify Svix signature
  const svixId        = request.headers.get('svix-id') ?? '';
  const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
  const svixSignature = request.headers.get('svix-signature') ?? '';

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent;
  } catch (err) {
    console.warn('Resend webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const eventType = EVENT_TYPE_MAP[event.type];
  if (!eventType) {
    // Unknown or unhandled event type — acknowledge without storing
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data } = event;
  const email = data.to?.[0];
  if (!email) {
    return NextResponse.json({ error: 'No recipient in payload' }, { status: 400 });
  }

  const resendMessageId = data.email_id;
  const campaignSlug    = data.tags?.campaign_slug ?? null;
  const clickUrl        = eventType === 'clicked' ? (data.click?.link ?? null) : null;

  // Resolve person_id from email
  const { data: person } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  const personId = person?.id ?? null;

  // Build metadata
  const metadata: Record<string, unknown> = {
    subject:    data.subject ?? null,
    resendType: event.type,
  };
  if (data.click) {
    metadata.userAgent = data.click.user_agent ?? null;
    metadata.ipAddress = data.click.ipAddress ?? null;
  }
  if (data.bounce) {
    metadata.bounceMessage = data.bounce.message ?? null;
  }

  const { error: insertError } = await supabaseAdmin
    .from('email_events')
    .insert({
      person_id:         personId,
      email,
      campaign_slug:     campaignSlug,
      resend_message_id: resendMessageId,
      event_type:        eventType,
      url:               clickUrl,
      metadata,
      created_at:        event.created_at ?? new Date().toISOString(),
    });

  if (insertError) {
    // Postgres unique_violation (23505) means the dedup indexes caught a retry — treat as success
    if ((insertError as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, eventType, resendMessageId, deduped: true });
    }
    // Any other error: log and return 500 so Resend retries
    console.error('Failed to insert email_event:', insertError.message, {
      resendMessageId,
      eventType,
      email,
    });
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventType, resendMessageId });
}
