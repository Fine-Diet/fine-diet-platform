/**
 * People Service
 * 
 * Server-side service for managing people, subscriptions, and events.
 * This module must only be imported in server contexts (API routes, server components).
 */

import { supabaseAdmin } from './supabaseServerClient';
import { ENABLE_N8N_WEBHOOK } from './featureFlags';

// ============================================================================
// Types
// ============================================================================

export type PersonStatus = 
  | 'marketing_only' 
  | 'waitlist' 
  | 'active_user' 
  | 'inactive_user' 
  | 'unsubscribed' 
  | 'blocked';

export type EventType = 
  | 'newsletter_signup' 
  | 'waitlist_join' 
  | 'status_change' 
  | 'profile_update' 
  | 'email_sent' 
  | 'sms_sent' 
  | 'unsubscribed' 
  | 'other';

export type SubscriptionType = 
  | 'email_marketing' 
  | 'product_updates' 
  | 'program_waitlist';

export interface UpsertPersonArgs {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  status?: PersonStatus;
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  emailOptIn?: boolean;
  smsOptIn?: boolean;
  authUserId?: string | null; // Links to auth.users.id
  metadata?: Record<string, any>;
}

export interface Person {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: PersonStatus;
  primary_source: string | null;
  last_source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  email_marketing_opt_in: boolean;
  email_opt_in_at: string | null;
  sms_marketing_opt_in: boolean;
  sms_opt_in_at: string | null;
  auth_user_id: string | null; // Links to auth.users.id
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface EnsureSubscriptionArgs {
  personId: string;
  type: SubscriptionType;
  programSlug?: string | null;
}

export interface LogEventArgs {
  personId: string;
  eventType: EventType;
  source?: string | null;
  channel?: string | null;
  metadata?: Record<string, any>;
}

// ============================================================================
// Status Priority (for never downgrading)
// ============================================================================

const STATUS_PRIORITY: Record<PersonStatus, number> = {
  'marketing_only': 1,
  'inactive_user': 2,
  'waitlist': 3,
  'active_user': 4,
  'unsubscribed': 5,
  'blocked': 6,
};

function getStatusPriority(status: PersonStatus): number {
  return STATUS_PRIORITY[status] || 0;
}

function shouldUpgradeStatus(current: PersonStatus, proposed: PersonStatus): boolean {
  return getStatusPriority(proposed) > getStatusPriority(current);
}

// ============================================================================
// Email Normalization
// ============================================================================

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ============================================================================
// Upsert Person
// ============================================================================

export async function upsertPerson(args: UpsertPersonArgs): Promise<Person> {
  const normalizedEmail = normalizeEmail(args.email);
  const now = new Date().toISOString();

  // Fetch existing person if they exist
  const { data: existingPerson, error: fetchError } = await supabaseAdmin
    .from('people')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
    throw new Error(`Failed to fetch existing person: ${fetchError.message}`);
  }

  // Determine status (never downgrade)
  let finalStatus: PersonStatus = args.status || 'marketing_only';
  if (existingPerson) {
    const existingStatus = existingPerson.status as PersonStatus;
    if (!shouldUpgradeStatus(existingStatus, finalStatus)) {
      finalStatus = existingStatus;
    }
  }

  // Merge metadata
  const existingMetadata = existingPerson?.metadata || {};
  const newMetadata = args.metadata || {};
  const mergedMetadata = { ...existingMetadata, ...newMetadata };

  // Determine primary_source (only set if person is new)
  const primarySource = existingPerson ? existingPerson.primary_source : (args.source || null);
  const lastSource = args.source || existingPerson?.last_source || null;

  // Handle opt-in timestamps
  const emailOptInAt = args.emailOptIn === true 
    ? (existingPerson?.email_opt_in_at || now)
    : existingPerson?.email_opt_in_at || null;

  const smsOptInAt = args.smsOptIn === true
    ? (existingPerson?.sms_opt_in_at || now)
    : existingPerson?.sms_opt_in_at || null;

  // Handle auth_user_id: only set if provided and not already set
  // Once set, it should not be overwritten (security: prevent account hijacking)
  const authUserId = args.authUserId || existingPerson?.auth_user_id || null;

  // Prepare upsert data
  const upsertData: any = {
    email: normalizedEmail,
    first_name: args.firstName || existingPerson?.first_name || null,
    last_name: args.lastName || existingPerson?.last_name || null,
    phone: args.phone || existingPerson?.phone || null,
    status: finalStatus,
    primary_source: primarySource,
    last_source: lastSource,
    utm_source: args.utmSource || existingPerson?.utm_source || null,
    utm_medium: args.utmMedium || existingPerson?.utm_medium || null,
    utm_campaign: args.utmCampaign || existingPerson?.utm_campaign || null,
    email_marketing_opt_in: args.emailOptIn !== undefined ? args.emailOptIn : (existingPerson?.email_marketing_opt_in ?? true),
    email_opt_in_at: emailOptInAt,
    sms_marketing_opt_in: args.smsOptIn !== undefined ? args.smsOptIn : (existingPerson?.sms_marketing_opt_in ?? false),
    sms_opt_in_at: smsOptInAt,
    auth_user_id: authUserId,
    metadata: mergedMetadata,
    updated_at: now,
  };

  // Only set created_at for new records
  if (!existingPerson) {
    upsertData.created_at = now;
  }

  // Upsert person
  // Note: The unique constraint is on lower(email), but Supabase will handle this
  // when we use onConflict with the email column
  const { data: person, error: upsertError } = await supabaseAdmin
    .from('people')
    .upsert(upsertData, {
      onConflict: 'email',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (upsertError) {
    throw new Error(`Failed to upsert person: ${upsertError.message}`);
  }

  return person as Person;
}

// ============================================================================
// Ensure Subscription
// ============================================================================

export async function ensureSubscription(args: EnsureSubscriptionArgs): Promise<void> {
  const { personId, type, programSlug } = args;

  const subscriptionData: any = {
    person_id: personId,
    subscription_type: type,
    program_slug: programSlug || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  // Use upsert with unique constraint on (person_id, subscription_type, program_slug)
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subscriptionData, {
      onConflict: 'person_id,subscription_type,program_slug',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to ensure subscription: ${error.message}`);
  }
}

// ============================================================================
// Log Event
// ============================================================================

export async function logEvent(args: LogEventArgs): Promise<void> {
  const { personId, eventType, source, channel, metadata } = args;

  const eventData = {
    person_id: personId,
    event_type: eventType,
    source: source || null,
    channel: channel || null,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('people_events')
    .insert(eventData);

  if (error) {
    throw new Error(`Failed to log event: ${error.message}`);
  }
}

// ============================================================================
// Emit N8N Webhook
// ============================================================================

export async function emitN8nWebhook(payload: any): Promise<void> {
  if (!ENABLE_N8N_WEBHOOK) {
    return;
  }

  const webhookUrl = process.env.N8N_PEOPLE_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(`N8N webhook returned status ${response.status}`);
    }
  } catch (error) {
    // Swallow errors - log only
    console.warn('N8N webhook failed:', error);
  }
}

