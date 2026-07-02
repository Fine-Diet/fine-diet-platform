/**
 * Communication Service
 *
 * People-native outbox and event layer for campaign moments. SMS currently
 * supports mock/log-only delivery by default and Twilio when explicitly enabled.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { sendSms, getActiveSmsProvider } from './smsProvider';

export type CommunicationChannel = 'email' | 'sms';
export type CommunicationStatus =
  | 'pending'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface QueueCommunicationArgs {
  personId: string;
  campaignKey?: string | null;
  channel: CommunicationChannel;
  provider?: string | null;
  toAddress: string;
  subject?: string | null;
  body: string;
  scheduledFor?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordSmsConsentArgs {
  personId: string;
  phone: string;
  consentStatus: 'opted_in' | 'opted_out';
  source?: string | null;
  consentText?: string | null;
  consentVersion?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown>;
}

export interface QueueWaitlistSmsConfirmationArgs {
  personId: string;
  firstName?: string | null;
  phone?: string | null;
  smsOptIn: boolean;
  campaignKey?: string | null;
  programSlug?: string | null;
  offerKey?: string | null;
  startPageSlug?: string | null;
  captureMode?: string | null;
  preferredChannel?: string | null;
  source?: string | null;
}

interface OutboxMessage {
  id: string;
  person_id: string;
  campaign_key: string | null;
  channel: CommunicationChannel;
  provider: string;
  to_address: string;
  subject: string | null;
  body: string;
  status: CommunicationStatus;
  scheduled_for: string | null;
  attempts: number;
  metadata: Record<string, unknown>;
}

function isScheduledForFuture(scheduledFor?: string | null): boolean {
  if (!scheduledFor) return false;
  return new Date(scheduledFor).getTime() > Date.now();
}

export async function queueCommunicationMessage(
  args: QueueCommunicationArgs,
): Promise<string> {
  const now = new Date().toISOString();
  const status: CommunicationStatus = isScheduledForFuture(args.scheduledFor)
    ? 'scheduled'
    : 'pending';

  const { data, error } = await supabaseAdmin
    .from('communication_outbox')
    .insert({
      person_id: args.personId,
      campaign_key: args.campaignKey || null,
      channel: args.channel,
      provider: args.provider || (args.channel === 'sms' ? getActiveSmsProvider() : 'resend'),
      to_address: args.toAddress,
      subject: args.subject || null,
      body: args.body,
      status,
      scheduled_for: args.scheduledFor || null,
      metadata: args.metadata || {},
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to queue communication message: ${error.message}`);
  }

  await recordCommunicationEvent({
    outboxId: data.id,
    personId: args.personId,
    campaignKey: args.campaignKey || null,
    channel: args.channel,
    provider: args.provider || (args.channel === 'sms' ? getActiveSmsProvider() : 'resend'),
    eventType: status === 'scheduled' ? 'scheduled' : 'queued',
    metadata: args.metadata || {},
  });

  return data.id as string;
}

export async function recordCommunicationEvent(args: {
  outboxId?: string | null;
  personId?: string | null;
  campaignKey?: string | null;
  channel?: CommunicationChannel | null;
  provider?: string | null;
  eventType: string;
  providerEventId?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('communication_events').insert({
    outbox_id: args.outboxId || null,
    person_id: args.personId || null,
    campaign_key: args.campaignKey || null,
    channel: args.channel || null,
    provider: args.provider || null,
    event_type: args.eventType,
    provider_event_id: args.providerEventId || null,
    provider_message_id: args.providerMessageId || null,
    metadata: args.metadata || {},
    occurred_at: args.occurredAt || new Date().toISOString(),
  });

  if (error) {
    // Unique provider event replays should not break webhook processing.
    if (error.code === '23505') return;
    throw new Error(`Failed to record communication event: ${error.message}`);
  }
}

export async function recordSmsConsentChange(
  args: RecordSmsConsentArgs,
): Promise<void> {
  const now = new Date().toISOString();
  const optedIn = args.consentStatus === 'opted_in';

  const { error: personError } = await supabaseAdmin
    .from('people')
    .update({
      phone: args.phone,
      sms_marketing_opt_in: optedIn,
      sms_opt_in_at: optedIn ? now : undefined,
      sms_opt_out_at: optedIn ? null : now,
      sms_consent_source: args.source || null,
      sms_consent_text: args.consentText || null,
      sms_consent_version: args.consentVersion || null,
      updated_at: now,
    })
    .eq('id', args.personId);

  if (personError) {
    throw new Error(`Failed to update SMS consent on person: ${personError.message}`);
  }

  const { error: consentError } = await supabaseAdmin
    .from('sms_consent_events')
    .insert({
      person_id: args.personId,
      phone: args.phone,
      consent_status: args.consentStatus,
      source: args.source || null,
      consent_text: args.consentText || null,
      consent_version: args.consentVersion || null,
      provider: args.provider || null,
      metadata: args.metadata || {},
      created_at: now,
    });

  if (consentError) {
    throw new Error(`Failed to record SMS consent event: ${consentError.message}`);
  }
}

export async function queueWaitlistSmsConfirmation(
  args: QueueWaitlistSmsConfirmationArgs,
): Promise<string | null> {
  if (!args.smsOptIn || !args.phone) {
    return null;
  }

  const firstName = args.firstName?.trim() || 'there';
  const programLabel = args.programSlug ? ` for ${args.programSlug}` : '';
  const body = `Hi ${firstName}, you are on the Fine Diet waitlist${programLabel}. We will text you when priority access opens. Reply STOP to opt out.`;

  return queueCommunicationMessage({
    personId: args.personId,
    campaignKey: args.campaignKey || 'waitlist_confirmation_sms',
    channel: 'sms',
    toAddress: args.phone,
    body,
    metadata: {
      programSlug: args.programSlug || null,
      offerKey: args.offerKey || null,
      startPageSlug: args.startPageSlug || null,
      captureMode: args.captureMode || null,
      preferredChannel: args.preferredChannel || null,
      source: args.source || null,
      kind: 'waitlist_confirmation',
    },
  });
}

async function getPersonSmsEligibility(personId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('sms_marketing_opt_in, sms_opt_out_at, phone')
    .eq('id', personId)
    .maybeSingle();

  if (error) {
    return { eligible: false, reason: error.message };
  }
  if (!data) {
    return { eligible: false, reason: 'person_not_found' };
  }
  if (!data.sms_marketing_opt_in) {
    return { eligible: false, reason: 'sms_not_opted_in' };
  }
  if (data.sms_opt_out_at) {
    return { eligible: false, reason: 'sms_opted_out' };
  }
  if (!data.phone) {
    return { eligible: false, reason: 'missing_phone' };
  }
  return { eligible: true };
}

export async function processPendingSmsMessages(limit = 10): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const now = new Date().toISOString();
  const { data: messages, error } = await supabaseAdmin
    .from('communication_outbox')
    .select('*')
    .eq('channel', 'sms')
    .in('status', ['pending', 'scheduled'])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch pending SMS messages: ${error.message}`);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const message of (messages || []) as OutboxMessage[]) {
    const provider = getActiveSmsProvider();
    const startedAt = new Date().toISOString();

    await supabaseAdmin
      .from('communication_outbox')
      .update({
        status: 'sending',
        provider,
        attempts: (message.attempts || 0) + 1,
        updated_at: startedAt,
      })
      .eq('id', message.id);

    const eligibility = await getPersonSmsEligibility(message.person_id);
    if (!eligibility.eligible) {
      skipped++;
      await supabaseAdmin
        .from('communication_outbox')
        .update({
          status: 'skipped',
          provider_error: eligibility.reason || 'not_eligible',
          updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);
      await recordCommunicationEvent({
        outboxId: message.id,
        personId: message.person_id,
        campaignKey: message.campaign_key,
        channel: 'sms',
        provider,
        eventType: 'skipped',
        metadata: { reason: eligibility.reason || 'not_eligible' },
      });
      continue;
    }

    try {
      const result = await sendSms({
        to: message.to_address,
        body: message.body,
        metadata: message.metadata || {},
      });

      sent++;
      await supabaseAdmin
        .from('communication_outbox')
        .update({
          status: 'sent',
          provider: result.provider,
          provider_message_id: result.providerMessageId,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);

      await recordCommunicationEvent({
        outboxId: message.id,
        personId: message.person_id,
        campaignKey: message.campaign_key,
        channel: 'sms',
        provider: result.provider,
        eventType: 'sent',
        providerMessageId: result.providerMessageId,
        metadata: { raw: result.raw ?? null },
      });

      await supabaseAdmin.from('people_events').insert({
        person_id: message.person_id,
        event_type: 'sms_sent',
        source: 'communication_outbox',
        channel: 'sms',
        metadata: {
          outboxId: message.id,
          campaignKey: message.campaign_key,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
        },
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      failed++;
      const messageText = err instanceof Error ? err.message : 'Unknown SMS send error';
      errors.push(`${message.id}: ${messageText}`);
      await supabaseAdmin
        .from('communication_outbox')
        .update({
          status: 'failed',
          provider,
          provider_error: messageText,
          failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', message.id);
      await recordCommunicationEvent({
        outboxId: message.id,
        personId: message.person_id,
        campaignKey: message.campaign_key,
        channel: 'sms',
        provider,
        eventType: 'failed',
        metadata: { error: messageText },
      });
    }
  }

  return {
    processed: (messages || []).length,
    sent,
    skipped,
    failed,
    errors,
  };
}
