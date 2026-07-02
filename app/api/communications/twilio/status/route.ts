import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { recordCommunicationEvent } from '@/lib/communications/communicationService';

function mapTwilioStatus(status: string | null): string | null {
  switch (status) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
      return 'pending';
    case 'sending':
      return 'sending';
    case 'sent':
    case 'delivered':
      return 'sent';
    case 'undelivered':
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

/**
 * POST /api/communications/twilio/status
 *
 * Twilio status callback receiver. This is dormant until Twilio is configured.
 * TODO before live activation: add Twilio request signature verification.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const messageSid = String(form.get('MessageSid') || '');
  const messageStatus = String(form.get('MessageStatus') || '');
  const errorCode = form.get('ErrorCode') ? String(form.get('ErrorCode')) : null;
  const errorMessage = form.get('ErrorMessage') ? String(form.get('ErrorMessage')) : null;

  if (!messageSid) {
    return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 });
  }

  const { data: outbox } = await supabaseAdmin
    .from('communication_outbox')
    .select('id, person_id, campaign_key, channel, provider')
    .eq('provider_message_id', messageSid)
    .maybeSingle();

  const mappedStatus = mapTwilioStatus(messageStatus);
  if (outbox && mappedStatus) {
    await supabaseAdmin
      .from('communication_outbox')
      .update({
        status: mappedStatus,
        provider_error: errorCode || errorMessage ? `${errorCode || ''} ${errorMessage || ''}`.trim() : null,
        failed_at: mappedStatus === 'failed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', outbox.id);
  }

  await recordCommunicationEvent({
    outboxId: outbox?.id || null,
    personId: outbox?.person_id || null,
    campaignKey: outbox?.campaign_key || null,
    channel: 'sms',
    provider: 'twilio',
    eventType: messageStatus || 'status_callback',
    providerEventId: `${messageSid}:${messageStatus}:${form.get('Timestamp') || Date.now()}`,
    providerMessageId: messageSid,
    metadata: {
      errorCode,
      errorMessage,
      raw: Object.fromEntries(form.entries()),
    },
  });

  return NextResponse.json({ ok: true });
}
