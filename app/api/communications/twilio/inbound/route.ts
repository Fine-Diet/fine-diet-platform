import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  recordCommunicationEvent,
  recordSmsConsentChange,
} from '@/lib/communications/communicationService';

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'YES', 'UNSTOP']);

function normalizeInboundBody(body: string): string {
  return body.trim().split(/\s+/)[0]?.toUpperCase() || '';
}

function twiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}

/**
 * POST /api/communications/twilio/inbound
 *
 * Twilio inbound SMS receiver. Handles STOP/START-style consent feedback in the
 * Fine Diet people system. Dormant until Twilio is configured.
 * TODO before live activation: add Twilio request signature verification.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = String(form.get('From') || '');
  const body = String(form.get('Body') || '');
  const messageSid = String(form.get('MessageSid') || '');
  const keyword = normalizeInboundBody(body);

  if (!from) {
    return NextResponse.json({ error: 'Missing From' }, { status: 400 });
  }

  const { data: person } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('phone', from)
    .maybeSingle();

  await recordCommunicationEvent({
    personId: person?.id || null,
    channel: 'sms',
    provider: 'twilio',
    eventType: 'inbound_message',
    providerEventId: messageSid || undefined,
    providerMessageId: messageSid || undefined,
    metadata: {
      from,
      body,
      raw: Object.fromEntries(form.entries()),
    },
  });

  if (!person) {
    return new NextResponse(twiml('Thanks for your message.'), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  if (STOP_WORDS.has(keyword)) {
    await recordSmsConsentChange({
      personId: person.id,
      phone: from,
      consentStatus: 'opted_out',
      source: 'twilio_inbound_stop',
      provider: 'twilio',
      metadata: { inboundBody: body, messageSid },
    });
    return new NextResponse(twiml('You are unsubscribed from Fine Diet SMS updates. Reply START to rejoin.'), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  if (START_WORDS.has(keyword)) {
    await recordSmsConsentChange({
      personId: person.id,
      phone: from,
      consentStatus: 'opted_in',
      source: 'twilio_inbound_start',
      consentText: 'Inbound SMS opt-in via START/YES/UNSTOP.',
      consentVersion: 'twilio-keyword-v1',
      provider: 'twilio',
      metadata: { inboundBody: body, messageSid },
    });
    return new NextResponse(twiml('You are subscribed to Fine Diet SMS updates. Reply STOP to opt out.'), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  return new NextResponse(twiml('Thanks for your message. Reply STOP to opt out.'), {
    headers: { 'Content-Type': 'text/xml' },
  });
}
