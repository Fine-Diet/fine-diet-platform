import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  upsertPerson,
  ensureSubscription,
  logEvent,
  emitN8nWebhook,
} from '@/lib/peopleService';

// Validation schema
const waitlistSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().optional().nullable(),
  goal: z.enum(['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other']).optional().nullable(),
  source: z.string().optional().default('journal_waitlist'),
  programSlug: z.string().optional(),
  phone: z.string().optional().nullable(),
  smsOptIn: z.boolean().optional().default(false),
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

/**
 * POST /api/people/waitlist
 * 
 * Handles waitlist submissions for programs (journal, the-program, etc.)
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

    // Upsert person (with UTM fields)
    const person = await upsertPerson({
      email: data.email,
      firstName,
      lastName,
      phone: data.phone || null,
      status: 'waitlist',
      source: data.source,
      smsOptIn: data.smsOptIn,
      // Pass UTM fields to peopleService
      utmSource: data.utm_source || null,
      utmMedium: data.utm_medium || null,
      utmCampaign: data.utm_campaign || null,
      metadata: {
        goal: data.goal || null,
      },
    });

    // Ensure subscription
    await ensureSubscription({
      personId: person.id,
      type: 'program_waitlist',
      programSlug: data.programSlug || 'journal',
    });

    // Log event with full metadata
    await logEvent({
      personId: person.id,
      eventType: 'waitlist_join',
      source: data.source,
      channel: 'web',
      metadata: {
        goal: data.goal || null,
        programSlug: data.programSlug || 'journal',
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
    const programSlug = data.programSlug || 'journal';
    await emitN8nWebhook({
      kind: 'waitlist_join',
      person: {
        id: person.id,
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
        status: person.status,
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

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}

