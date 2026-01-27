import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  upsertPerson,
  ensureSubscription,
  logEvent,
  emitN8nWebhook,
} from '@/lib/peopleService';

/**
 * Legacy Waitlist Schema
 * 
 * Accepts the original payload shape for backward compatibility.
 */
const legacyWaitlistSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().optional().nullable(),
  goal: z.enum(['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other']).optional().nullable(),
  source: z.string().optional(), // Allow source override if passed
});

type LegacyWaitlistData = z.infer<typeof legacyWaitlistSchema>;

/**
 * POST /api/waitlist
 * 
 * COMPATIBILITY SHIM: Forwards requests to the People System.
 * 
 * This route is maintained for backward compatibility with any existing
 * integrations. It does NOT write to the legacy waitlist table.
 * All data flows through the People System:
 *   - upsertPerson (people table)
 *   - ensureSubscription (subscriptions table)
 *   - logEvent (people_events table)
 *   - emitN8nWebhook (if enabled)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = legacyWaitlistSchema.safeParse(body);

    if (!validationResult.success) {
      // Return legacy error format for backward compatibility
      const firstError = validationResult.error.issues[0];
      const errorMessage = firstError?.message === 'Invalid email address' 
        ? 'Invalid email' 
        : 'Invalid payload';
      
      return NextResponse.json(
        { ok: false, error: errorMessage },
        { status: 400 }
      );
    }

    const data: LegacyWaitlistData = validationResult.data;
    const source = data.source || 'legacy_waitlist';

    // Split name into firstName / lastName if provided
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (data.name) {
      const nameParts = data.name.trim().split(/\s+/);
      firstName = nameParts[0] || null;
      lastName = nameParts.slice(1).join(' ') || null;
    }

    // ========================================================================
    // Forward to People System (identical behavior to /api/people/waitlist)
    // ========================================================================

    // 1. Upsert person
    const person = await upsertPerson({
      email: data.email,
      firstName,
      lastName,
      status: 'waitlist',
      source,
      metadata: {
        goal: data.goal || null,
      },
    });

    // 2. Ensure subscription (journal waitlist by default)
    await ensureSubscription({
      personId: person.id,
      type: 'program_waitlist',
      programSlug: 'journal',
    });

    // 3. Log waitlist_join event
    await logEvent({
      personId: person.id,
      eventType: 'waitlist_join',
      source,
      channel: 'web',
      metadata: {
        goal: data.goal || null,
        programSlug: 'journal',
        legacy_shim: true, // Mark as coming through legacy endpoint
      },
    });

    // 4. Emit n8n webhook (if enabled)
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
        program_slug: 'journal',
        is_active: true,
      },
      event: {
        event_type: 'waitlist_join',
        source,
        metadata: {
          goal: data.goal || null,
          programSlug: 'journal',
          legacy_shim: true,
        },
      },
      context: {
        source_path: null,
        redirect_path: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
      },
    });

    // Return legacy success format
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500 }
    );
  }
}

