import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  upsertPerson,
  ensureSubscription,
  logEvent,
  emitN8nWebhook,
} from '@/lib/peopleService';
import {
  queueWaitlistSmsConfirmation,
  recordSmsConsentChange,
} from '@/lib/communications/communicationService';

const DEFAULT_SMS_CONSENT_TEXT =
  'I agree to receive SMS updates from Fine Diet about this offer. Msg & data rates may apply. Reply STOP to opt out.';

// Validation schema
const waitlistSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().optional().nullable(),
  goal: z.enum(['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other']).optional().nullable(),
  source: z.string().optional().default('journal_waitlist'),
  programSlug: z.string().optional(),
  offerKey: z.string().optional().nullable(),
  startPageSlug: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  smsOptIn: z.boolean().optional().default(false),
  smsConsentText: z.string().optional().nullable(),
  smsConsentVersion: z.string().optional().default('waitlist-sms-v1'),
  captureMode: z.enum(['simple', 'priority', 'concierge']).optional().default('simple'),
  preferredChannel: z.enum(['email', 'sms', 'either']).optional().nullable(),
  campaignKey: z.string().optional().nullable(),
  // Context fields for tracking and redirect
  source_path: z.string().optional().nullable(),
  redirect_path: z.string().optional().nullable(),
  // UTM tracking fields
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  utm_term: z.string().optional().nullable(),
  utm_content: z.string().optional().nullable(),
});

type WaitlistData = z.infer<typeof waitlistSchema>;

/**
 * Validate redirect_path is a safe relative path
 * Returns null if valid, error message if invalid
 */
function validateRedirectPath(redirectPath: string | null | undefined): string | null {
  if (!redirectPath) {
    return null; // Empty is allowed
  }

  // Reject external URLs (http:// or https://)
  if (redirectPath.startsWith('http://') || redirectPath.startsWith('https://')) {
    return 'redirect_path must be a relative path, not an external URL';
  }

  // Reject protocol-relative URLs (//)
  if (redirectPath.startsWith('//')) {
    return 'redirect_path must be a relative path starting with /';
  }

  // Must start with /
  if (!redirectPath.startsWith('/')) {
    return 'redirect_path must start with /';
  }

  return null; // Valid
}

function cleanPhone(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim();
  return trimmed || null;
}

/**
 * POST /api/people/waitlist
 * 
 * Handles waitlist submissions for programs (journal, the-program, etc.) and
 * queues People-native communication moments when SMS consent is present.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = waitlistSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data: WaitlistData = validationResult.data;
    const phone = cleanPhone(data.phone);

    if (data.smsOptIn && !phone) {
      return NextResponse.json(
        { error: 'Phone number is required when SMS opt-in is selected.' },
        { status: 400 },
      );
    }

    if (data.preferredChannel === 'sms' && !phone) {
      return NextResponse.json(
        { error: 'Phone number is required when SMS is the preferred contact method.' },
        { status: 400 },
      );
    }

    // Validate redirect_path security BEFORE any DB writes
    const redirectError = validateRedirectPath(data.redirect_path);
    if (redirectError) {
      return NextResponse.json(
        { error: redirectError },
        { status: 400 }
      );
    }

    // Split name into firstName / lastName if provided
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (data.name) {
      const nameParts = data.name.trim().split(/\s+/);
      firstName = nameParts[0] || null;
      lastName = nameParts.slice(1).join(' ') || null;
    }

    const programSlug = data.programSlug || 'journal';
    const smsConsentText = data.smsConsentText || DEFAULT_SMS_CONSENT_TEXT;
    const smsConsentVersion = data.smsConsentVersion || 'waitlist-sms-v1';

    // Upsert person (with UTM fields)
    const person = await upsertPerson({
      email: data.email,
      firstName,
      lastName,
      phone,
      status: 'waitlist',
      source: data.source,
      smsOptIn: data.smsOptIn,
      smsConsentSource: data.smsOptIn ? data.source : null,
      smsConsentText: data.smsOptIn ? smsConsentText : null,
      smsConsentVersion: data.smsOptIn ? smsConsentVersion : null,
      preferredContactChannel: data.preferredChannel || null,
      // Pass UTM fields to peopleService
      utmSource: data.utm_source || null,
      utmMedium: data.utm_medium || null,
      utmCampaign: data.utm_campaign || null,
      metadata: {
        goal: data.goal || null,
        captureMode: data.captureMode,
        offerKey: data.offerKey || null,
        startPageSlug: data.startPageSlug || null,
        preferredChannel: data.preferredChannel || null,
      },
    });

    if (data.smsOptIn && phone) {
      await recordSmsConsentChange({
        personId: person.id,
        phone,
        consentStatus: 'opted_in',
        source: data.source,
        consentText: smsConsentText,
        consentVersion: smsConsentVersion,
        metadata: {
          programSlug,
          offerKey: data.offerKey || null,
          startPageSlug: data.startPageSlug || null,
          captureMode: data.captureMode,
          preferredChannel: data.preferredChannel || null,
        },
      });
    }

    // Ensure subscription
    await ensureSubscription({
      personId: person.id,
      type: 'program_waitlist',
      programSlug,
    });

    const queuedSmsOutboxId = await queueWaitlistSmsConfirmation({
      personId: person.id,
      firstName,
      phone,
      smsOptIn: data.smsOptIn,
      campaignKey: data.campaignKey || 'waitlist_confirmation_sms',
      programSlug,
      offerKey: data.offerKey || null,
      startPageSlug: data.startPageSlug || null,
      captureMode: data.captureMode,
      preferredChannel: data.preferredChannel || null,
      source: data.source,
    });

    // Log event with full metadata
    await logEvent({
      personId: person.id,
      eventType: 'waitlist_join',
      source: data.source,
      channel: 'web',
      metadata: {
        goal: data.goal || null,
        programSlug,
        offerKey: data.offerKey || null,
        startPageSlug: data.startPageSlug || null,
        captureMode: data.captureMode,
        preferredChannel: data.preferredChannel || null,
        smsOptIn: data.smsOptIn,
        smsConsentVersion: data.smsOptIn ? smsConsentVersion : null,
        queuedSmsOutboxId,
        source_path: data.source_path || null,
        redirect_path: data.redirect_path || null,
        utm_source: data.utm_source || null,
        utm_medium: data.utm_medium || null,
        utm_campaign: data.utm_campaign || null,
        utm_term: data.utm_term || null,
        utm_content: data.utm_content || null,
      },
    });

    // Emit n8n webhook with structured payload
    await emitN8nWebhook({
      kind: 'waitlist_join',
      person: {
        id: person.id,
        email: person.email,
        phone: person.phone,
        firstName: person.first_name,
        lastName: person.last_name,
        status: person.status,
        preferredContactChannel: person.preferred_contact_channel,
        smsOptIn: person.sms_marketing_opt_in,
      },
      subscription: {
        subscription_type: 'program_waitlist',
        program_slug: programSlug,
        is_active: true,
      },
      event: {
        event_type: 'waitlist_join',
        source: data.source,
        metadata: {
          goal: data.goal || null,
          programSlug,
          offerKey: data.offerKey || null,
          startPageSlug: data.startPageSlug || null,
          captureMode: data.captureMode,
          queuedSmsOutboxId,
        },
      },
      context: {
        source_path: data.source_path || null,
        redirect_path: data.redirect_path || null,
        utm_source: data.utm_source || null,
        utm_medium: data.utm_medium || null,
        utm_campaign: data.utm_campaign || null,
      },
    });

    return NextResponse.json({ ok: true, queuedSmsOutboxId }, { status: 200 });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
