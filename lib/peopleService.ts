/**
 * People Service
 * 
 * Server-side service for managing people, subscriptions, and events.
 * This module must only be imported in server contexts (API routes, server components).
 */

import { supabaseAdmin } from './supabaseServerClient';
import { getFeatureFlags } from './config/getConfig';

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
  | 'fine_print_signup'
  | 'preference_update'
  | 'other';

export type SubscriptionType = 
  | 'email_marketing' 
  | 'product_updates' 
  | 'program_waitlist'
  | 'journal_access';

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
  const slug = programSlug || null;

  // The DB unique index uses COALESCE(program_slug, ''), which Supabase's onConflict
  // clause cannot resolve when program_slug IS NULL (NULL != NULL in equality).
  // We use a manual select-then-update/insert to guarantee idempotency.
  let lookup = supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('person_id', personId)
    .eq('subscription_type', type);

  lookup = slug ? lookup.eq('program_slug', slug) : lookup.is('program_slug', null);

  const { data: existing, error: lookupError } = await lookup.maybeSingle();
  if (lookupError) throw new Error(`Failed to look up subscription: ${lookupError.message}`);

  if (existing) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new Error(`Failed to activate subscription: ${error.message}`);
  } else {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        person_id: personId,
        subscription_type: type,
        program_slug: slug,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to create subscription: ${error.message}`);
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
// Email Preferences
// ============================================================================

export interface EmailPreferences {
  id: string;
  person_id: string;
  product_updates: boolean;
  nutrition_insights: boolean;
  program_offers: boolean;
  early_access: boolean;
  double_opt_in_confirmed_at: string | null;
  unsubscribe_all_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertEmailPreferencesArgs {
  personId: string;
  productUpdates?: boolean;
  nutritionInsights?: boolean;
  programOffers?: boolean;
  earlyAccess?: boolean;
  /** Explicitly set the double-opt-in confirmation timestamp */
  doubleOptInConfirmedAt?: string | null;
  /** Explicitly set the global unsubscribe timestamp */
  unsubscribeAllAt?: string | null;
}

/**
 * Upsert a person's email topic preferences.
 *
 * Boolean preference fields are monotonically increasing — passing `true` turns
 * a topic on but no signup flow can turn it back off. Use `unsubscribeAllAt`
 * to suppress all sends at the global level.
 */
export async function upsertEmailPreferences(
  args: UpsertEmailPreferencesArgs,
): Promise<void> {
  const now = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('email_preferences')
    .select('*')
    .eq('person_id', args.personId)
    .maybeSingle();

  const upsertData: Record<string, unknown> = {
    person_id: args.personId,
    // Prefs only turn ON — OR with existing value
    product_updates:
      (args.productUpdates === true) || (existing?.product_updates === true),
    nutrition_insights:
      (args.nutritionInsights === true) || (existing?.nutrition_insights === true),
    program_offers:
      (args.programOffers === true) || (existing?.program_offers === true),
    early_access:
      (args.earlyAccess === true) || (existing?.early_access === true),
    updated_at: now,
  };

  if (!existing) {
    upsertData.created_at = now;
  }
  if (args.doubleOptInConfirmedAt !== undefined) {
    upsertData.double_opt_in_confirmed_at = args.doubleOptInConfirmedAt;
  }
  if (args.unsubscribeAllAt !== undefined) {
    upsertData.unsubscribe_all_at = args.unsubscribeAllAt;
  }

  const { error } = await supabaseAdmin
    .from('email_preferences')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(upsertData as any, {
      onConflict: 'person_id',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to upsert email preferences: ${error.message}`);
  }
}

// ============================================================================
// Emit N8N Webhook
// ============================================================================

export async function emitN8nWebhook(payload: any): Promise<void> {
  // Phase 2 / Step 2: Load feature flag from CMS, with env var override
  const envOverride = process.env.ENABLE_N8N_WEBHOOK === 'true';
  const flags = await getFeatureFlags();
  const isEnabled = envOverride || flags.enableN8nWebhook;

  if (!isEnabled) {
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

