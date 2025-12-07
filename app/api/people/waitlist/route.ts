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
});

type WaitlistData = z.infer<typeof waitlistSchema>;

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

    // Split name into firstName / lastName if provided
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (data.name) {
      const nameParts = data.name.trim().split(/\s+/);
      firstName = nameParts[0] || null;
      lastName = nameParts.slice(1).join(' ') || null;
    }

    // Upsert person
    const person = await upsertPerson({
      email: data.email,
      firstName,
      lastName,
      phone: data.phone || null,
      status: 'waitlist',
      source: data.source,
      smsOptIn: data.smsOptIn,
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

    // Log event
    await logEvent({
      personId: person.id,
      eventType: 'waitlist_join',
      source: data.source,
      channel: 'web',
      metadata: {
        goal: data.goal || null,
        programSlug: data.programSlug || 'journal',
      },
    });

    // Emit n8n webhook
    await emitN8nWebhook({
      kind: 'waitlist_join',
      person: {
        id: person.id,
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
      },
      goal: data.goal || null,
      programSlug: data.programSlug || 'journal',
      source: data.source,
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

